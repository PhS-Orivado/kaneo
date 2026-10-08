import { describe, expect, it } from "vite-plus/test";
import { buildJql, parseArgs } from "./args.js";

describe("parseArgs", () => {
  it("parses string flags", () => {
    const args = parseArgs([
      "--jira-url",
      "https://acme.atlassian.net",
      "--jira-email",
      "me@acme.com",
      "--jira-token=secret",
    ]);

    expect(args.jiraUrl).toBe("https://acme.atlassian.net");
    expect(args.jiraEmail).toBe("me@acme.com");
    expect(args.jiraToken).toBe("secret");
  });

  it("collects repeatable flags", () => {
    const args = parseArgs([
      "--project",
      "SUP",
      "--project",
      "OPS",
      "--type",
      "Bug",
    ]);
    expect(args.projects).toEqual(["SUP", "OPS"]);
    expect(args.types).toEqual(["Bug"]);
  });

  it("rejects unknown options", () => {
    expect(() => parseArgs(["--bogus"])).toThrow(/Unknown option/);
  });

  it("rejects an unknown status preset", () => {
    expect(() => parseArgs(["--status", "done"])).toThrow(
      /--status must be one of/,
    );
  });

  it("defaults to all issues", () => {
    expect(parseArgs([]).status).toBe("all");
  });

  it("parses boolean flags", () => {
    const args = parseArgs(["--dry-run", "--skip-comments", "-y"]);
    expect(args.dryRun).toBe(true);
    expect(args.skipComments).toBe(true);
    expect(args.yes).toBe(true);
  });
});

describe("buildJql", () => {
  it("returns an empty filter when nothing is selected", () => {
    expect(buildJql(parseArgs([]))).toBe("");
  });

  it("maps status presets to Jira status categories", () => {
    expect(buildJql(parseArgs(["--status", "open"]))).toBe(
      'statusCategory = "To Do"',
    );
    expect(buildJql(parseArgs(["--status", "in-progress"]))).toBe(
      'statusCategory = "In Progress"',
    );
    expect(buildJql(parseArgs(["--status", "closed"]))).toBe(
      'statusCategory = "Done"',
    );
  });

  it("AND-combines every filter", () => {
    const args = parseArgs([
      "--status",
      "closed",
      "--type",
      "Bug",
      "--label",
      "urgent",
      "--assignee",
      "me@acme.com",
      "--updated-after",
      "2026-01-01",
    ]);

    expect(buildJql(args)).toBe(
      'statusCategory = "Done" AND issuetype IN ("Bug") AND labels IN ("urgent") ' +
        'AND assignee = "me@acme.com" AND updated >= "2026-01-01"',
    );
  });

  it("wraps raw JQL so its ORs stay grouped", () => {
    const args = parseArgs([
      "--status",
      "open",
      "--jql",
      "labels = a OR labels = b",
    ]);

    expect(buildJql(args)).toBe(
      'statusCategory = "To Do" AND (labels = a OR labels = b)',
    );
  });
});
