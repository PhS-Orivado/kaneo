import { toIsoDate } from "../markdown.js";
import type {
  ImportedAttachment,
  ImportedComment,
  ImportedPriority,
  ImportedTask,
} from "../types.js";
import type { JiraIssue } from "./api-types.js";
import type { HtmlToMarkdown } from "./html.js";
import { issueLabels } from "./labels.js";
import { toPerson } from "./people.js";

const PRIORITIES: ReadonlyMap<string, ImportedPriority> = new Map([
  ["highest", "urgent"],
  ["blocker", "urgent"],
  ["critical", "urgent"],
  ["high", "high"],
  ["major", "high"],
  ["medium", "medium"],
  ["low", "low"],
  ["minor", "low"],
  ["lowest", "low"],
  ["trivial", "low"],
]);

export type IssueContext = {
  columnKey: string | null;
  comments: ImportedComment[];
  toMarkdown: HtmlToMarkdown;
  issueSprint?: ReadonlyMap<string, string>;
  /** Base URL of the Jira site, used to build source links. */
  baseUrl: string;
};

/** Joins a Jira base URL with a site path, tolerating trailing slashes. */
export function resolveJiraUrl(
  baseUrl: string,
  path: string | null | undefined,
): string | null {
  if (!path) return null;
  try {
    return new URL(path, `${baseUrl}/`).toString();
  } catch {
    return null;
  }
}

export function mapPriority(name: string | null | undefined): ImportedPriority {
  return PRIORITIES.get(name?.trim().toLowerCase() ?? "") ?? "no-priority";
}

export function issueNumber(
  key: string | null | undefined,
): number | undefined {
  const digits = /-(\d+)$/.exec(key?.trim() ?? "")?.[1];
  const number = digits ? Number(digits) : Number.NaN;
  return Number.isSafeInteger(number) && number > 0 ? number : undefined;
}

export function issueDescription(
  issue: JiraIssue,
  toMarkdown: HtmlToMarkdown,
): string {
  const rendered = issue.renderedFields?.description;
  if (typeof rendered === "string") return toMarkdown(rendered);
  const raw = issue.fields?.description;
  return typeof raw === "string" ? raw.trim() : "";
}

export function mapAttachments(issue: JiraIssue): ImportedAttachment[] {
  const attachments = issue.fields?.attachment ?? [];
  const mapped: ImportedAttachment[] = [];
  for (const attachment of attachments) {
    const contentUrl = attachment.content?.trim();
    const filename = attachment.filename?.trim();
    if (!contentUrl || !filename || !attachment.id) continue;
    const size =
      typeof attachment.size === "string"
        ? Number.parseInt(attachment.size, 10)
        : attachment.size;
    mapped.push({
      key: attachment.id,
      filename,
      ...(attachment.mimeType?.trim()
        ? { mimeType: attachment.mimeType.trim() }
        : {}),
      ...(typeof size === "number" && Number.isFinite(size) && size >= 0
        ? { size }
        : {}),
      contentUrl,
    });
  }
  return mapped;
}

export function mapIssue(
  issue: JiraIssue,
  context: IssueContext,
): ImportedTask {
  const fields = issue.fields ?? {};
  const number = issueNumber(issue.key);
  const dueDate = toIsoDate(fields.duedate);
  const createdAt = toIsoDate(fields.created);
  const assignee = toPerson(fields.assignee);
  const sprintKey = context.issueSprint?.get(issue.id) ?? null;
  const attachments = mapAttachments(issue);
  const sourceLabel = issue.key?.trim();
  const sourceUrl = sourceLabel
    ? resolveJiraUrl(context.baseUrl, `browse/${sourceLabel}`)
    : null;
  return {
    key: issue.id,
    ...(number !== undefined ? { number } : {}),
    columnKey: context.columnKey,
    title: fields.summary?.trim() || issue.key || "Untitled",
    description: issueDescription(issue, context.toMarkdown),
    priority: mapPriority(fields.priority?.name),
    ...(dueDate ? { dueDate } : {}),
    ...(createdAt ? { createdAt } : {}),
    ...(assignee ? { assignee } : {}),
    labelKeys: issueLabels(issue),
    comments: context.comments,
    ...(sprintKey ? { sprintKey } : {}),
    ...(attachments.length ? { attachments } : {}),
    ...(sourceLabel ? { sourceLabel } : {}),
    ...(sourceUrl ? { sourceUrl } : {}),
  };
}
