import { describe, expect, it } from "vite-plus/test";
import findJiraLinks from "./find-jira-links";

describe("findJiraLinks", () => {
  it("finds a Jira issue link and extracts its key and number", () => {
    const matches = findJiraLinks(
      "See https://jira.example.com/browse/ABC-42 for details.",
    );

    expect(matches).toEqual([
      {
        url: "https://jira.example.com/browse/ABC-42",
        projectKey: "ABC",
        issueNumber: 42,
        start: 4,
      },
    ]);
  });

  it("excludes trailing punctuation from the match", () => {
    const matches = findJiraLinks(
      "Fixed in https://jira.example.com/browse/ABC-1. Also (ABC-2).",
    );

    expect(matches).toEqual([
      {
        url: "https://jira.example.com/browse/ABC-1",
        projectKey: "ABC",
        issueNumber: 1,
        start: 9,
      },
    ]);
  });

  it("finds every link in order", () => {
    const matches = findJiraLinks(
      "https://x.atlassian.net/browse/ABC-1 and http://x.atlassian.net/browse/DEF-22",
    );

    expect(matches.map((match) => match.projectKey)).toEqual(["ABC", "DEF"]);
    expect(matches.map((match) => match.issueNumber)).toEqual([1, 22]);
  });

  it("ignores plain text and other URLs", () => {
    expect(findJiraLinks("ABC-1 without a URL")).toEqual([]);
    expect(findJiraLinks("https://example.com/issues/ABC-1")).toEqual([]);
  });
});
