import { describe, expect, it } from "vite-plus/test";
import {
  type ImportedTaskReference,
  buildReferenceLinkRewrites,
  rewriteReferenceLinks,
} from "./rewrite-imported-references";

const INTERNAL_URL = "https://kaneo.test/dashboard/workspace/ws/project/p1/task/t1";

const reference: ImportedTaskReference = {
  sourceLabel: "ABC-1",
  sourceUrl: "https://acme.atlassian.net/browse/ABC-1",
  projectId: "p1",
  taskId: "t1",
};

function rewrites(references: readonly ImportedTaskReference[]) {
  return buildReferenceLinkRewrites(
    references,
    (ref) =>
      `https://kaneo.test/dashboard/workspace/ws/project/${ref.projectId}/task/${ref.taskId}`,
  );
}

describe("buildReferenceLinkRewrites", () => {
  it("rewrites the source URL, absolute and relative, keeping anchors", () => {
    const result = rewrites([reference]);

    expect(
      rewriteReferenceLinks(
        "See https://acme.atlassian.net/browse/ABC-1 and /browse/ABC-1#comment-99",
        result,
      ),
    ).toBe(`See ${INTERNAL_URL} and ${INTERNAL_URL}#comment-99`);
  });

  it("turns bare keys into Markdown links to the internal task", () => {
    const result = rewrites([reference]);

    expect(
      rewriteReferenceLinks("blocked by ABC-1 today", result),
    ).toBe(`blocked by [ABC-1](${INTERNAL_URL}) today`);
  });

  it("leaves longer keys, other hosts and embedded keys alone", () => {
    const result = rewrites([reference]);

    const text = [
      "ABC-11 stays and ABC-12 too",
      "https://evil.test/browse/ABC-1 stays",
      "xABC-1 and path/ABC-1 stay",
      "[ABC-1](https://kaneo.test/already-internal) stays",
    ].join("; ");

    expect(rewriteReferenceLinks(text, result)).toBe(text);
  });

  it("rewrites URLs of tasks without a label and links keys without a URL", () => {
    const result = rewrites([
      { ...reference, sourceLabel: null },
      {
        sourceLabel: "OPS-7",
        sourceUrl: null,
        projectId: "p2",
        taskId: "t2",
      },
    ]);

    expect(
      rewriteReferenceLinks(
        "See OPS-7 and https://acme.atlassian.net/browse/ABC-1",
        result,
      ),
    ).toBe(
      `See [OPS-7](https://kaneo.test/dashboard/workspace/ws/project/p2/task/t2) and ${INTERNAL_URL}`,
    );
  });
});
