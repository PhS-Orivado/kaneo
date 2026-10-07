import { describe, expect, it } from "vite-plus/test";
import { classifyResourceUrl } from "../../../apps/api/src/external-link/classify-resource-url";

describe("classifyResourceUrl", () => {
  it("recognizes GitHub pull request URLs", () => {
    expect(classifyResourceUrl("https://github.com/a/b/pull/12")).toEqual({
      resourceType: "pull_request",
      externalId: "12",
    });
    expect(
      classifyResourceUrl("https://github.com/a/b/pull/12/files#discussion"),
    ).toEqual({
      resourceType: "pull_request",
      externalId: "12",
    });
  });

  it("recognizes Gitea and GitLab pull request URLs", () => {
    expect(classifyResourceUrl("https://git.example.com/a/b/pulls/7")).toEqual(
      {
        resourceType: "pull_request",
        externalId: "7",
      },
    );
    expect(
      classifyResourceUrl("https://gitlab.com/group/project/-/merge_requests/5"),
    ).toEqual({
      resourceType: "pull_request",
      externalId: "5",
    });
  });

  it("recognizes branch tree URLs, including slashy branch names", () => {
    expect(
      classifyResourceUrl("https://github.com/a/b/tree/fix/EC-123"),
    ).toEqual({
      resourceType: "branch",
      externalId: "fix/EC-123",
    });
    expect(
      classifyResourceUrl("https://gitlab.com/group/project/-/tree/main"),
    ).toEqual({
      resourceType: "branch",
      externalId: "main",
    });
  });

  it("falls back to a plain URL link", () => {
    expect(classifyResourceUrl("https://example.com/some/page")).toEqual({
      resourceType: "url",
      externalId: null,
    });
    expect(classifyResourceUrl("https://github.com/a/b/issues/9")).toEqual({
      resourceType: "url",
      externalId: null,
    });
  });
});
