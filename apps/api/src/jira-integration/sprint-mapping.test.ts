import { describe, expect, it } from "vitest";
import type { JiraIssue } from "../plugins/jira/utils/jira-api";
import {
  sprintStatusFromJiraState,
  sprintsForIssue,
} from "./sprint-mapping";

function issueWith(fields: Record<string, unknown>): JiraIssue {
  return {
    id: "1",
    key: "ABC-1",
    self: "https://jira.example.test/rest/api/2/issue/1",
    fields: { summary: "Issue", ...fields },
  } as unknown as JiraIssue;
}

describe("sprintStatusFromJiraState", () => {
  it("maps the Jira states onto the Kaneo statuses", () => {
    expect(sprintStatusFromJiraState("closed")).toBe("closed");
    expect(sprintStatusFromJiraState("CLOSED")).toBe("closed");
    expect(sprintStatusFromJiraState(" complete ")).toBe("closed");
    expect(sprintStatusFromJiraState("active")).toBe("active");
    expect(sprintStatusFromJiraState("ACTIVE")).toBe("active");
    expect(sprintStatusFromJiraState("future")).toBe("future");
    expect(sprintStatusFromJiraState(undefined)).toBe("future");
    expect(sprintStatusFromJiraState("")).toBe("future");
    expect(sprintStatusFromJiraState("unexpected")).toBe("future");
  });
});

describe("sprintsForIssue", () => {
  it("reads the sprints from the resolved sprint field, current one last", () => {
    const issue = issueWith({
      customfield_10001: [
        {
          id: 1,
          name: "Sprint 1",
          state: "closed",
          startDate: "2026-09-01T09:00:00.000+02:00",
          endDate: "2026-09-15T09:00:00.000+02:00",
          goal: "Import the backlog",
        },
        { id: 2, name: "Sprint 2", state: "active", goal: "" },
      ],
    });

    const sprints = sprintsForIssue(issue, ["customfield_10001"]);

    expect(sprints).toHaveLength(2);
    expect(sprints[0]).toMatchObject({
      key: "1",
      jiraId: "1",
      name: "Sprint 1",
      state: "closed",
      goal: "Import the backlog",
    });
    expect(sprints[0]?.startDate).toBeInstanceOf(Date);
    expect(sprints[0]?.endDate).toBeInstanceOf(Date);
    // An empty goal is dropped, the sprint stays.
    expect(sprints[1]).toMatchObject({
      key: "2",
      name: "Sprint 2",
      state: "active",
    });
    expect(sprints[1]?.goal).toBeUndefined();
    expect(sprints[1]?.startDate).toBeUndefined();
  });

  it("reads the single sprint object of a team-managed board", () => {
    const issue = issueWith({
      sprint: { id: 7, name: "Board sprint", state: "future" },
    });

    expect(sprintsForIssue(issue, ["sprint"])).toMatchObject([
      { key: "7", jiraId: "7", name: "Board sprint", state: "future" },
    ]);
  });

  it("parses the legacy GreenHopper string of Data Center builds", () => {
    const issue = issueWith({
      customfield_10005:
        "com.atlassian.greenhopper.service.sprint.Sprint@4f2fa1[id=42,rapidViewId=1,state=CLOSED,name=Sprint 9,startDate=2026-09-14T09:17:00.000+02:00,endDate=2026-09-28T17:00:00.000+02:00,completeDate=2026-09-29T08:39:04.340+02:00,activatedDate=2026-09-14T09:17:00.000+02:00]",
    });

    const sprints = sprintsForIssue(issue, ["customfield_10005"]);

    expect(sprints).toHaveLength(1);
    expect(sprints[0]).toMatchObject({
      key: "42",
      jiraId: "42",
      name: "Sprint 9",
      state: "CLOSED",
    });
    expect(sprints[0]?.startDate).toEqual(
      new Date("2026-09-14T09:17:00.000+02:00"),
    );
    expect(sprints[0]?.endDate).toEqual(
      new Date("2026-09-28T17:00:00.000+02:00"),
    );
  });

  it("ignores payloads that are not sprints", () => {
    const issue = issueWith({
      customfield_10001: null,
      summary: "A summary is not a sprint",
    });

    expect(sprintsForIssue(issue, ["customfield_10001"])).toEqual([]);
    // Fields outside the resolved sprint ids are never inspected.
    expect(
      sprintsForIssue(
        issueWith({ sprint: { id: 3, name: "S", state: "future" } }),
        [],
      ),
    ).toEqual([]);
    expect(
      sprintsForIssue(
        issueWith({ customfield_10001: "a plain string without attributes" }),
        ["customfield_10001"],
      ),
    ).toEqual([]);
    expect(
      sprintsForIssue(issueWith({ customfield_10001: { id: 3 } }), [
        "customfield_10001",
      ]),
    ).toEqual([]);
  });

  it("deduplicates sprints across the resolved fields", () => {
    const issue = issueWith({
      customfield_10001: [{ id: 5, name: "Same sprint", state: "closed" }],
      sprint: { id: 5, name: "Same sprint", state: "closed" },
    });

    const sprints = sprintsForIssue(issue, ["customfield_10001", "sprint"]);
    expect(sprints).toHaveLength(1);
  });
});
