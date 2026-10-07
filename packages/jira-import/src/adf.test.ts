import { describe, expect, it } from "vite-plus/test";
import { adfToMarkdown, type AdfDoc } from "./adf.js";

function doc(content: AdfDoc["content"]): AdfDoc {
  return { type: "doc", version: 1, content };
}

function text(
  value: string,
  marks?: { type: string; attrs?: Record<string, unknown> }[],
) {
  return { type: "text", text: value, ...(marks ? { marks } : {}) };
}

describe("adfToMarkdown", () => {
  it("returns empty output for null and undefined", () => {
    expect(adfToMarkdown(null).markdown).toBe("");
    expect(adfToMarkdown(undefined).markdown).toBe("");
  });

  it("passes plain strings through untouched", () => {
    expect(adfToMarkdown("Already markdown").markdown).toBe("Already markdown");
  });

  it("converts paragraphs and headings", () => {
    const result = adfToMarkdown(
      doc([
        { type: "heading", attrs: { level: 2 }, content: [text("Title")] },
        { type: "paragraph", content: [text("Body")] },
      ]),
    );

    expect(result.markdown).toBe("## Title\n\nBody");
  });

  it("applies marks", () => {
    const result = adfToMarkdown(
      doc([
        {
          type: "paragraph",
          content: [
            text("bold", [{ type: "strong" }]),
            text(" "),
            text("italic", [{ type: "em" }]),
            text(" "),
            text("code", [{ type: "code" }]),
            text(" "),
            text("link", [
              {
                type: "link",
                attrs: { href: "https://kaneo.app", title: "Kaneo" },
              },
            ]),
          ],
        },
      ]),
    );

    expect(result.markdown).toBe(
      '**bold** *italic* `code` [link](https://kaneo.app "Kaneo")',
    );
  });

  it("renders nested lists", () => {
    const result = adfToMarkdown(
      doc([
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                { type: "paragraph", content: [text("one")] },
                {
                  type: "bulletList",
                  content: [
                    {
                      type: "listItem",
                      content: [
                        { type: "paragraph", content: [text("nested")] },
                      ],
                    },
                  ],
                },
              ],
            },
            {
              type: "listItem",
              content: [{ type: "paragraph", content: [text("two")] }],
            },
          ],
        },
        {
          type: "orderedList",
          content: [
            {
              type: "listItem",
              content: [{ type: "paragraph", content: [text("first")] }],
            },
          ],
        },
      ]),
    );

    expect(result.markdown).toBe("- one\n  - nested\n- two\n\n1. first");
  });

  it("converts code blocks with a language", () => {
    const result = adfToMarkdown(
      doc([
        {
          type: "codeBlock",
          attrs: { language: "ts" },
          content: [text("const x = 1;")],
        },
      ]),
    );

    expect(result.markdown).toBe("```ts\nconst x = 1;\n```");
  });

  it("converts blockquotes and panels", () => {
    const result = adfToMarkdown(
      doc([
        {
          type: "blockquote",
          content: [{ type: "paragraph", content: [text("Old")] }],
        },
        {
          type: "panel",
          attrs: { panelType: "warning" },
          content: [{ type: "paragraph", content: [text("Careful")] }],
        },
      ]),
    );

    expect(result.markdown).toBe("> Old\n\n> **Warning**\n> Careful");
  });

  it("converts tables with a header row", () => {
    const result = adfToMarkdown(
      doc([
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                {
                  type: "tableHeader",
                  content: [{ type: "paragraph", content: [text("Name")] }],
                },
                {
                  type: "tableCell",
                  content: [{ type: "paragraph", content: [text("Value")] }],
                },
              ],
            },
            {
              type: "tableRow",
              content: [
                {
                  type: "tableCell",
                  content: [{ type: "paragraph", content: [text("Rows")] }],
                },
                {
                  type: "tableCell",
                  content: [{ type: "paragraph", content: [text("2")] }],
                },
              ],
            },
          ],
        },
      ]),
    );

    expect(result.markdown).toBe(
      "| **Name** | **Value** |\n| --- | --- |\n| Rows | 2 |",
    );
  });

  it("records media references as tokens", () => {
    const result = adfToMarkdown(
      doc([
        {
          type: "mediaSingle",
          content: [{ type: "media", attrs: { id: "att-1", type: "file" } }],
        },
      ]),
    );

    expect(result.markdown).toBe("%%JIRA-MEDIA:att-1%%");
    expect(result.media).toEqual([{ id: "att-1" }]);
  });

  it("keeps external media URLs inline", () => {
    const result = adfToMarkdown(
      doc([
        {
          type: "mediaSingle",
          content: [
            {
              type: "media",
              attrs: {
                id: "ext-1",
                type: "external",
                externalSrc: "https://x/y.png",
              },
            },
          ],
        },
      ]),
    );

    expect(result.markdown).toBe("![](https://x/y.png)");
  });

  it("converts mentions, emojis and status lozenges", () => {
    const result = adfToMarkdown(
      doc([
        {
          type: "paragraph",
          content: [
            { type: "mention", attrs: { displayName: "Jane" } },
            text(" "),
            { type: "emoji", attrs: { shortName: ":fire:" } },
            text(" "),
            { type: "status", attrs: { text: "In Review" } },
          ],
        },
      ]),
    );

    expect(result.markdown).toBe("@Jane :fire: **In Review**");
  });

  it("reduces unknown nodes to their text and reports them", () => {
    const result = adfToMarkdown(
      doc([
        {
          type: "someFutureMacro",
          content: [{ type: "paragraph", content: [text("payload")] }],
        } as never,
      ]),
    );

    expect(result.markdown).toBe("payload");
    expect(result.unknownNodes).toEqual(["someFutureMacro"]);
  });

  it("renders task lists as checkboxes", () => {
    const result = adfToMarkdown(
      doc([
        {
          type: "taskList",
          content: [
            {
              type: "taskItem",
              attrs: { state: "DONE" },
              content: [text("done")],
            },
            {
              type: "taskItem",
              attrs: { state: "TODO" },
              content: [text("todo")],
            },
          ],
        },
      ]),
    );

    expect(result.markdown).toBe("- [x] done\n- [ ] todo");
  });
});
