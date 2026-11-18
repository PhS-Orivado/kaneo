import { describe, expect, it } from "vite-plus/test";
import rewriteJiraLinksInText from "./rewrite-jira-links-in-text";

const resolve = (projectKey: string, issueNumber: number) =>
  projectKey === "ABC" && issueNumber === 1
    ? { url: "http://localhost:5173/task/t1", taskId: "t1", projectId: "p1" }
    : null;

describe("rewriteJiraLinksInText", () => {
  it("replaces a resolvable link with the target URL", () => {
    const result = rewriteJiraLinksInText(
      "See https://jira.example.com/browse/ABC-1 please.",
      resolve,
    );

    expect(result.text).toBe("See http://localhost:5173/task/t1 please.");
    expect(result.replacements).toEqual([
      {
        sourceUrl: "https://jira.example.com/browse/ABC-1",
        targetUrl: "http://localhost:5173/task/t1",
        targetTaskId: "t1",
        targetProjectId: "p1",
      },
    ]);
    expect(result.unresolvedUrls).toEqual([]);
  });

  it("leaves unresolvable links unchanged and reports them", () => {
    const result = rewriteJiraLinksInText(
      "See https://jira.example.com/browse/ABC-1 and https://jira.example.com/browse/XYZ-9.",
      resolve,
    );

    expect(result.text).toBe(
      "See http://localhost:5173/task/t1 and https://jira.example.com/browse/XYZ-9.",
    );
    expect(result.unresolvedUrls).toEqual([
      "https://jira.example.com/browse/XYZ-9",
    ]);
    expect(result.replacements).toHaveLength(1);
  });

  it("rewrites several links in one text", () => {
    const result = rewriteJiraLinksInText(
      "https://jira.example.com/browse/ABC-1 https://jira.example.com/browse/ABC-1",
      resolve,
    );

    expect(result.text).toBe(
      "http://localhost:5173/task/t1 http://localhost:5173/task/t1",
    );
    expect(result.replacements).toHaveLength(2);
  });

  it("returns the input text when it has no Jira links", () => {
    const result = rewriteJiraLinksInText("Nothing to rewrite.", resolve);

    expect(result.text).toBe("Nothing to rewrite.");
    expect(result.replacements).toEqual([]);
    expect(result.unresolvedUrls).toEqual([]);
  });
});
