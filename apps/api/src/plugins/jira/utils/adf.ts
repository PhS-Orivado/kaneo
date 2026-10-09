// Atlassian Document Format (ADF) to Markdown converter.
//
// Jira descriptions and comments are ADF documents. This converts the node
// types that occur in practice; anything it does not know is reduced to its
// text content, and the unknown type is reported back so the importer can
// warn instead of losing data silently.

export type AdfMark = {
  type: string;
  attrs?: Record<string, unknown>;
};

export type AdfNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: AdfNode[];
  marks?: AdfMark[];
  text?: string;
};

export type AdfDoc = {
  type: "doc";
  version?: number;
  content?: AdfNode[];
};

export type MediaRef = {
  id: string;
  external?: boolean;
  alt?: string;
};

export type AdfResult = {
  markdown: string;
  media: MediaRef[];
  unknownNodes: string[];
};

const EMPTY_RESULT: AdfResult = { markdown: "", media: [], unknownNodes: [] };

export function adfToMarkdown(
  doc: AdfDoc | string | null | undefined,
): AdfResult {
  if (doc == null) return EMPTY_RESULT;

  // Some Jira deployments still return plain strings for legacy fields.
  if (typeof doc === "string") {
    const text = doc.trim();
    return { markdown: text, media: [], unknownNodes: [] };
  }

  if (typeof doc !== "object" || doc.type !== "doc") return EMPTY_RESULT;

  const media: MediaRef[] = [];
  const unknownNodes = new Set<string>();
  const blocks = renderNodes(doc.content ?? [], { media, unknownNodes });
  const markdown = joinBlocks(blocks);

  return {
    markdown,
    media: dedupeMedia(media),
    unknownNodes: [...unknownNodes],
  };
}

type RenderContext = {
  media: MediaRef[];
  unknownNodes: Set<string>;
};

type Block =
  | { kind: "line"; text: string }
  | { kind: "lines"; lines: string[] }
  | { kind: "quote"; blocks: Block[] };

function renderNodes(nodes: AdfNode[], context: RenderContext): Block[] {
  return nodes.map((node) => renderBlock(node, context)).filter(hasContent);
}

function hasContent(block: Block): boolean {
  if (block.kind === "line") return block.text.length > 0;
  if (block.kind === "lines") return block.lines.length > 0;
  return block.blocks.length > 0;
}

function joinBlocks(blocks: Block[]): string {
  return blocks
    .map((block) => blockToMarkdown(block))
    .filter((text) => text.length > 0)
    .join("\n\n");
}

function blockToMarkdown(block: Block): string {
  if (block.kind === "line") return block.text;
  if (block.kind === "lines") return block.lines.join("\n");
  return block.blocks
    .map((inner) => blockToMarkdown(inner))
    .map((line) =>
      line
        .split("\n")
        .map((part) => `> ${part}`.trimEnd())
        .join("\n"),
    )
    .join("\n\n");
}

// Block node types the renderer supports; children of unknown nodes with
// these types are rendered normally rather than flagged.
const BLOCK_TYPES = new Set([
  "paragraph",
  "heading",
  "bulletList",
  "orderedList",
  "taskList",
  "codeBlock",
  "blockquote",
  "panel",
  "rule",
  "mediaSingle",
  "table",
]);

function renderBlock(node: AdfNode, context: RenderContext): Block {
  switch (node.type) {
    case "paragraph":
      return { kind: "line", text: renderInline(node.content ?? [], context) };

    case "heading": {
      const level = numberAttr(node, "level", 1) ?? 1;
      const hashes = "#".repeat(Math.min(Math.max(level, 1), 6));
      return {
        kind: "line",
        text: `${hashes} ${renderInline(node.content ?? [], context)}`,
      };
    }

    case "bulletList":
      return { kind: "lines", lines: renderList(node, 0, false, context) };

    case "orderedList":
      return { kind: "lines", lines: renderList(node, 0, true, context) };

    case "taskList":
      return { kind: "lines", lines: renderTaskList(node, context) };

    case "codeBlock": {
      const language = stringAttr(node, "language");
      const text = (node.content ?? [])
        .map((child) => child.text ?? "")
        .join("");
      const fence = language ? `\`\`\`${language}` : "```";
      return { kind: "line", text: `${fence}\n${text}\n\`\`\`` };
    }

    case "blockquote":
      return {
        kind: "quote",
        blocks: renderNodes(node.content ?? [], context),
      };

    case "panel": {
      const label = panelLabel(stringAttr(node, "panelType"));
      const inner = joinBlocks(renderNodes(node.content ?? [], context));
      const lines = inner.split("\n").map((line) => `> ${line}`.trimEnd());
      return { kind: "line", text: [`> **${label}**`, ...lines].join("\n") };
    }

    case "rule":
      return { kind: "line", text: "---" };

    case "mediaSingle":
      return { kind: "line", text: renderInline(node.content ?? [], context) };

    case "table":
      return { kind: "line", text: renderTable(node, context) };

    default: {
      // Media can appear directly at block level outside a mediaSingle; it
      // is fully supported, so never flag it as unknown.
      if (node.type === "media") {
        return { kind: "line", text: renderMedia(node, context) };
      }
      // Unknown block: keep whatever text it carries and flag the type so
      // the caller can warn. Data is never dropped silently. Block-level
      // children that the renderer supports (a paragraph inside a future
      // macro, say) render normally instead of being flagged a second
      // time by the inline renderer.
      context.unknownNodes.add(node.type);
      const parts: string[] = [];
      let inlineRun = "";
      for (const child of node.content ?? []) {
        if (BLOCK_TYPES.has(child.type)) {
          if (inlineRun !== "") {
            parts.push(inlineRun);
            inlineRun = "";
          }
          parts.push(joinBlocks([renderBlock(child, context)]));
        } else {
          inlineRun += renderInline([child], context);
        }
      }
      if (inlineRun !== "") parts.push(inlineRun);
      return { kind: "line", text: parts.join("\n") };
    }
  }
}

function renderList(
  node: AdfNode,
  depth: number,
  ordered: boolean,
  context: RenderContext,
): string[] {
  const lines: string[] = [];
  let index = numberAttr(node, "start", 1) || 1;

  for (const item of node.content ?? []) {
    if (item.type !== "listItem") continue;

    const prefix = ordered ? `${index++}. ` : "- ";
    const indent = "  ".repeat(depth);

    const paragraphs: string[] = [];
    const nested: string[] = [];

    for (const child of item.content ?? []) {
      if (child.type === "bulletList" || child.type === "orderedList") {
        nested.push(
          ...renderList(
            child,
            depth + 1,
            child.type === "orderedList",
            context,
          ),
        );
        continue;
      }

      const block = renderBlock(child, context);
      if (block.kind === "line" && block.text.length > 0) {
        paragraphs.push(block.text.replace(/\n+/g, " "));
      }
    }

    const head = paragraphs.shift() ?? "";
    lines.push(`${indent}${prefix}${head}`.trimEnd());

    for (const paragraph of paragraphs) {
      lines.push(
        `${indent}${"  ".repeat(ordered ? 2 : prefix.length)}${paragraph}`,
      );
    }

    lines.push(...nested);
  }

  return lines;
}

function renderTaskList(node: AdfNode, context: RenderContext): string[] {
  return (node.content ?? [])
    .filter((item) => item.type === "taskItem")
    .map((item) => {
      const done = (stringAttr(item, "state") ?? "").toUpperCase() === "DONE";
      const text = renderInline(item.content ?? [], context).replace(
        /\n+/g,
        " ",
      );
      return `- [${done ? "x" : " "}] ${text}`;
    });
}

function renderTable(node: AdfNode, context: RenderContext): string {
  const rows = (node.content ?? [])
    .filter((row) => row.type === "tableRow")
    .map((row) =>
      (row.content ?? [])
        .filter(
          (cell) => cell.type === "tableCell" || cell.type === "tableHeader",
        )
        .map((cell) => {
          const blocks = renderNodes(cell.content ?? [], context);
          return joinBlocks(blocks).replace(/\n+/g, "<br>");
        }),
    )
    .filter((row) => row.length > 0);

  if (rows.length === 0) return "";

  const width = Math.max(...rows.map((row) => row.length));
  const normalized = rows.map((row) => {
    const padded = [...row];
    while (padded.length < width) padded.push("");
    return padded;
  });

  // GFM tables require a header row; use the first row, whatever Jira called it.
  const [header, ...body] = normalized as [string[], ...string[][]];
  const lines = [
    `| ${header.map((cell) => `**${cell}**`).join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
    ...body.map((row) => `| ${row.join(" | ")} |`),
  ];

  return lines.join("\n");
}

function renderInline(nodes: AdfNode[], context: RenderContext): string {
  return nodes.map((node) => renderInlineNode(node, context)).join("");
}

function renderInlineNode(node: AdfNode, context: RenderContext): string {
  switch (node.type) {
    case "text":
      return applyMarks(node.text ?? "", node.marks ?? []);

    case "hardBreak":
      return "  \n";

    case "mention": {
      const name =
        stringAttr(node, "displayName") ||
        (node.attrs?.text as string | undefined) ||
        "user";
      return `@${name}`;
    }

    case "emoji":
      return (
        stringAttr(node, "fallback") || stringAttr(node, "shortName") || ""
      );

    case "date": {
      const timestamp = numberAttr(node, "timestamp");
      if (timestamp == null) return "";
      return new Date(timestamp).toISOString().slice(0, 10);
    }

    case "status":
      return `**${stringAttr(node, "text") || "status"}**`;

    case "inlineCard": {
      const url = stringAttr(node, "url");
      return url ? `<${url}>` : "";
    }

    case "media":
      return renderMedia(node, context);

    case "inlineExtension":
    case "extension":
    case "bodiedExtension":
      context.unknownNodes.add(node.type);
      return renderInline(node.content ?? [], context);

    case "placeholder":
      return stringAttr(node, "text") ?? "";

    default:
      context.unknownNodes.add(node.type);
      return renderInline(node.content ?? [], context);
  }
}

function renderMedia(node: AdfNode, context: RenderContext): string {
  const id = stringAttr(node, "id") || `unknown-${context.media.length}`;
  const external = stringAttr(node, "type") === "external";
  const ref: MediaRef = {
    id,
    ...(external ? { external: true } : {}),
    ...(stringAttr(node, "alt") ? { alt: stringAttr(node, "alt") } : {}),
  };
  context.media.push(ref);

  if (external) {
    const url = stringAttr(node, "externalSrc");
    if (url) return `![${ref.alt ?? ""}](${url})`;
  }

  // Resolved by the migration once the attachment has been uploaded; the token
  // format keeps the placeholder findable across description and comments.
  return `%%JIRA-MEDIA:${id}%%`;
}

function applyMarks(text: string, marks: AdfMark[]): string {
  let result = text;

  for (const mark of marks) {
    switch (mark.type) {
      case "strong":
        result = `**${result}**`;
        break;
      case "em":
        result = `*${result}*`;
        break;
      case "code":
        result = `\`${result}\``;
        break;
      case "strike":
        result = `~~${result}~~`;
        break;
      case "link": {
        const href = (mark.attrs?.href as string | undefined) ?? "";
        const title = (mark.attrs?.title as string | undefined) ?? "";
        const suffix = title ? ` "${title}"` : "";
        result = href ? `[${result}](${href}${suffix})` : result;
        break;
      }
      // underline, textColor and friends have no portable Markdown form;
      // the text itself is preserved untouched.
      default:
        break;
    }
  }

  return result;
}

function panelLabel(panelType: string | undefined): string {
  switch (panelType) {
    case "info":
      return "Info";
    case "note":
      return "Note";
    case "warning":
      return "Warning";
    case "error":
      return "Error";
    default:
      return "Panel";
  }
}

function numberAttr(
  node: AdfNode,
  key: string,
  fallback?: number,
): number | undefined {
  const value = node.attrs?.[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (
    typeof value === "string" &&
    value !== "" &&
    Number.isFinite(Number(value))
  ) {
    return Number(value);
  }
  return fallback;
}

function stringAttr(node: AdfNode, key: string): string | undefined {
  const value = node.attrs?.[key];
  return typeof value === "string" ? value : undefined;
}

function dedupeMedia(media: MediaRef[]): MediaRef[] {
  const seen = new Set<string>();
  return media.filter((ref) => {
    if (seen.has(ref.id)) return false;
    seen.add(ref.id);
    return true;
  });
}
