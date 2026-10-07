import { describe, expect, it } from "vite-plus/test";
import { buildAppendix, serializeAppendixValue } from "./appendix.js";
import { labelColorFor } from "./colors.js";
import { toColumnSlug, toProjectKey, uniqueKey } from "./keys.js";
import {
  labelsForIssue,
  planStatusColumns,
  relationForLink,
  sprintForIssue,
  toDateRange,
  toPriority,
  toTitle,
  worklogTimes,
} from "./mapping.js";
import type { JiraIssue } from "./jira.js";

function issue(fields: Partial<JiraIssue["fields"]>, key = "SUP-1"): JiraIssue {
  return { key, fields: { summary: "Something", ...fields } };
}

describe("priority mapping", () => {
  it("maps the five Jira defaults", () => {
    expect(toPriority("Highest")).toBe("urgent");
    expect(toPriority("High")).toBe("high");
    expect(toPriority("Medium")).toBe("medium");
    expect(toPriority("Low")).toBe("low");
    expect(toPriority("Lowest")).toBe("no-priority");
  });

  it("falls back to medium for unknown and missing priorities", () => {
    expect(toPriority("Critical")).toBe("medium");
    expect(toPriority(undefined)).toBe("no-priority");
    expect(toPriority(null)).toBe("no-priority");
  });
});

describe("planStatusColumns", () => {
  it("orders columns by status category and marks the last Done column final", () => {
    const issues = [
      issue({
        status: {
          name: "In Progress",
          statusCategory: { key: "indeterminate" },
        },
      }),
      issue({ status: { name: "Done", statusCategory: { key: "done" } } }),
      issue({ status: { name: "To Do", statusCategory: { key: "new" } } }),
      issue({
        status: { name: "Blocked", statusCategory: { key: "indeterminate" } },
      }),
      issue({ status: { name: "Closed", statusCategory: { key: "done" } } }),
    ];

    const plan = planStatusColumns(issues);
    expect(plan.columns.map((column) => column.name)).toEqual([
      "To Do",
      "In Progress",
      "Blocked",
      "Done",
      "Closed",
    ]);
    expect(plan.columns.at(-1)?.isFinal).toBe(true);
    expect(plan.columns.at(-2)?.isFinal).toBe(false);
    expect(plan.slugByStatusName.get("Blocked")).toBe(toColumnSlug("Blocked"));
  });

  it("avoids reserved slugs and duplicates", () => {
    const issues = [
      issue({ status: { name: "Planned", statusCategory: { key: "new" } } }),
      issue({ status: { name: "planned", statusCategory: { key: "new" } } }),
    ];

    const plan = planStatusColumns(issues);
    const slugs = plan.columns.map((column) => column.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(slugs).not.toContain("planned");
    expect(slugs).not.toContain("archived");
  });

  it("marks the only Done column as final", () => {
    const plan = planStatusColumns([
      issue({ status: { name: "Open", statusCategory: { key: "new" } } }),
      issue({ status: { name: "Resolved", statusCategory: { key: "done" } } }),
    ]);
    expect(plan.columns.at(-1)?.isFinal).toBe(true);
  });
});

describe("issue shaping", () => {
  it("prefixes the Jira key in the title", () => {
    expect(toTitle(issue({ summary: "Fix login" }, "SUP-42"))).toBe(
      "[SUP-42] Fix login",
    );
  });

  it("keeps the start date only when it precedes the due date", () => {
    const overdue = toDateRange({
      created: "2026-06-01T10:00:00.000Z",
      duedate: "2026-05-01",
    });
    expect(overdue).toEqual({
      dueDate: new Date("2026-05-01T23:59:59Z").toISOString(),
    });

    const healthy = toDateRange({
      created: "2026-01-01T10:00:00.000Z",
      duedate: "2026-05-01",
    });
    expect(healthy.startDate).toBe("2026-01-01T10:00:00.000Z");
    expect(healthy.dueDate).toBe(
      new Date("2026-05-01T23:59:59Z").toISOString(),
    );
  });

  it("derives labels from types, components and versions", () => {
    const labels = labelsForIssue(
      issue({
        labels: ["customer"],
        issuetype: { name: "Bug" },
        components: [{ name: "API" }],
        versions: [{ name: "1.2" }],
        fixVersions: [{ name: "1.3" }],
      }),
    );

    expect(labels).toEqual([
      "customer",
      "type:bug",
      "component:API",
      "version:1.2",
      "version:1.3",
    ]);
  });

  it("prefers the most recent sprint", () => {
    const result = sprintForIssue(
      issue({
        customfield_101: [
          { id: 1, name: "Sprint 1", state: "CLOSED" },
          { id: 2, name: "Sprint 2", state: "ACTIVE", goal: "Ship it" },
        ],
      }),
    );

    expect(result).toEqual({
      name: "Sprint 2",
      state: "ACTIVE",
      goal: "Ship it",
    });
  });
});

describe("relationForLink", () => {
  it("normalizes Blocks in both directions", () => {
    const source = issue({}, "SUP-1");

    const outward = relationForLink(source, {
      id: "l1",
      type: { name: "Blocks" },
      outwardIssue: { key: "SUP-2" },
    });
    expect(outward).toEqual({
      relationType: "blocks",
      sourceKey: "SUP-1",
      targetKey: "SUP-2",
    });

    const inward = relationForLink(source, {
      id: "l2",
      type: { name: "Blocks" },
      inwardIssue: { key: "SUP-0" },
    });
    expect(inward).toEqual({
      relationType: "blocks",
      sourceKey: "SUP-0",
      targetKey: "SUP-1",
    });
  });

  it("maps every other link type to related", () => {
    const source = issue({}, "SUP-1");
    const relation = relationForLink(source, {
      id: "l3",
      type: { name: "Relates" },
      outwardIssue: { key: "SUP-9" },
    });

    expect(relation?.relationType).toBe("related");
    expect(relation?.targetKey).toBe("SUP-9");
  });

  it("ignores links without a counterpart issue", () => {
    const source = issue({}, "SUP-1");
    expect(
      relationForLink(source, { id: "l4", type: { name: "Blocks" } }),
    ).toBeNull();
  });
});

describe("worklogTimes", () => {
  it("computes the end time from the duration", () => {
    const times = worklogTimes({
      started: "2026-01-02T09:00:00.000+0000",
      timeSpentSeconds: 3600,
    });

    expect(times.startTime).toBe("2026-01-02T09:00:00.000Z");
    expect(times.endTime).toBe("2026-01-02T10:00:00.000Z");
  });

  it("survives worklogs without a duration", () => {
    expect(worklogTimes({ started: "2026-01-02T09:00:00.000Z" })).toEqual({
      startTime: "2026-01-02T09:00:00.000Z",
    });
    expect(worklogTimes({})).toEqual({});
  });
});

describe("keys and colors", () => {
  it("derives stable project keys and dedupes them", () => {
    expect(toProjectKey("Customer Success")).toBe("CS");
    const taken = new Set<string>(["CS"]);
    expect(uniqueKey("CS", taken)).toBe("CS-2");
  });

  it("gives the same label name the same color", () => {
    expect(labelColorFor("type:bug")).toBe(labelColorFor("type:bug"));
    expect(labelColorFor("type:bug")).not.toBe(labelColorFor("type:task"));
  });
});

describe("appendix", () => {
  it("keeps primitives, arrays and objects readable", () => {
    expect(serializeAppendixValue("  plain ")).toBe("plain");
    expect(serializeAppendixValue(42)).toBe("42");
    expect(serializeAppendixValue(["a", "b"])).toBe("a, b");
    expect(serializeAppendixValue({ nested: true })).toBe('{"nested":true}');
  });

  it("renders only non-empty entries as a blockquote", () => {
    const appendix = buildAppendix([
      { label: "Reporter", value: "Jane" },
      { label: "Empty", value: "" },
      { label: "Votes", value: 0 },
    ]);

    expect(appendix).toBe(
      "> **Imported from Jira**\n> - **Reporter:** Jane\n> - **Votes:** 0",
    );
  });
});
