import { describe, expect, it } from "vite-plus/test";
import type { ImportedAttachment } from "@kaneo/importers";
import {
  buildAttachmentLinkRewrites,
  rewriteAttachmentLinks,
} from "./rewrite-attachment-links";

const attachment: ImportedAttachment = {
  id: "10000",
  filename: "shot.png",
  mimeType: "image/png",
  size: 1234,
  url: "https://acme.atlassian.net/rest/api/3/attachment/content/10000",
};

const KANEO_URL = "https://kaneo.example.com/api/asset/abc";

describe("rewriteAttachmentLinks", () => {
  it("rewrites browse and content URLs, absolute and relative", () => {
    const rewrites = buildAttachmentLinkRewrites(
      [attachment],
      () => KANEO_URL,
    );

    const text = [
      "![shot](https://acme.atlassian.net/secure/attachment/10000/shot.png)",
      "[file](https://acme.atlassian.net/rest/api/3/attachment/content/10000)",
      "![](/secure/attachment/10000/shot.png)",
      "Also /rest/api/2/attachment/content/10000 here",
      "Another site's /jira/secure/attachment/10000/shot.png stays",
    ].join("\n");

    expect(rewriteAttachmentLinks(text, rewrites)).toBe(
      [
        `![shot](${KANEO_URL})`,
        `[file](${KANEO_URL})`,
        `![](${KANEO_URL})`,
        `Also ${KANEO_URL} here`,
        "Another site's /jira/secure/attachment/10000/shot.png stays",
      ].join("\n"),
    );
  });

  it("leaves other hosts and other attachments alone", () => {
    const rewrites = buildAttachmentLinkRewrites(
      [attachment],
      () => KANEO_URL,
    );

    const text =
      "https://evil.test/secure/attachment/10000/shot.png and /secure/attachment/9999/x.png";
    expect(rewriteAttachmentLinks(text, rewrites)).toBe(text);
  });
});
