import type { ImportedAttachment } from "../types.js";
import type { JiraAttachment } from "./api-types.js";

const DEFAULT_FILENAME = "attachment";
const DEFAULT_MIME_TYPE = "application/octet-stream";

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

export function mapAttachments(
  baseUrl: string,
  attachments: JiraAttachment[] | null | undefined,
): ImportedAttachment[] {
  if (!attachments) return [];
  const mapped: ImportedAttachment[] = [];
  for (const attachment of attachments) {
    const url = resolveJiraUrl(baseUrl, attachment.content);
    if (!attachment.id || !url) continue;
    mapped.push({
      id: String(attachment.id),
      filename: attachment.filename?.trim() || DEFAULT_FILENAME,
      mimeType: attachment.mimeType?.trim() || DEFAULT_MIME_TYPE,
      size: typeof attachment.size === "number" ? attachment.size : 0,
      url,
    });
  }
  return mapped;
}
