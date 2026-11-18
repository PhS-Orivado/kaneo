import { describe, expect, it } from "vite-plus/test";
import buildJiraLinkResolver from "./build-jira-link-resolver";

const projects = [
  { id: "p1", slug: "ABC" },
  { id: "p2", slug: "ABC-2" },
  { id: "p3", slug: "design" },
];

const tasks = [
  { id: "t1", projectId: "p1", number: 1 },
  { id: "t2", projectId: "p1", number: 2 },
  { id: "t3", projectId: "p2", number: 1 },
  { id: "t4", projectId: "p3", number: 1 },
];

const resolve = buildJiraLinkResolver(projects, tasks);

describe("buildJiraLinkResolver", () => {
  it("resolves by project slug and task number", () => {
    expect(resolve("ABC", 1)).toEqual({ taskId: "t1", projectId: "p1" });
    expect(resolve("ABC", 2)).toEqual({ taskId: "t2", projectId: "p1" });
  });

  it("matches the project slug case-insensitively", () => {
    expect(resolve("abc", 1)).toEqual({ taskId: "t1", projectId: "p1" });
  });

  it("falls back to the unique suffixed project holding the number", () => {
    expect(resolve("ABC", 0)).toBeNull();

    const suffixed = buildJiraLinkResolver(
      [
        { id: "q1", slug: "XYZ" },
        { id: "q2", slug: "XYZ-2" },
      ],
      [
        { id: "u1", projectId: "q2", number: 5 },
      ],
    );

    expect(suffixed("XYZ", 5)).toEqual({ taskId: "u1", projectId: "q2" });
  });

  it("prefers the exact slug project over suffixed projects", () => {
    const resolver = buildJiraLinkResolver(
      [
        { id: "r1", slug: "XYZ" },
        { id: "r2", slug: "XYZ-2" },
      ],
      [
        { id: "v1", projectId: "r1", number: 1 },
        { id: "v2", projectId: "r2", number: 1 },
      ],
    );

    expect(resolver("XYZ", 1)).toEqual({ taskId: "v1", projectId: "r1" });
  });

  it("returns null when the number is ambiguous across suffixed projects", () => {
    const resolver = buildJiraLinkResolver(
      [
        { id: "s1", slug: "XYZ-2" },
        { id: "s2", slug: "XYZ-3" },
      ],
      [
        { id: "w1", projectId: "s1", number: 1 },
        { id: "w2", projectId: "s2", number: 1 },
      ],
    );

    expect(resolver("XYZ", 1)).toBeNull();
  });

  it("returns null for unknown projects and numbers", () => {
    expect(resolve("MISSING", 1)).toBeNull();
    expect(resolve("ABC", 999)).toBeNull();
    expect(resolve("design", 1)).toEqual({ taskId: "t4", projectId: "p3" });
  });
});
