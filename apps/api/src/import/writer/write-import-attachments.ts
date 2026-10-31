import type { ImportedAttachment } from "@kaneo/importers";
import { eq } from "drizzle-orm";
import db from "../../database";
import { assetTable, taskTable } from "../../database/schema";
import { describeStorageError } from "../../storage/describe-storage-error";
import {
  getStorageBackendStatus,
  type StorageBackendStatus,
} from "../../storage/backend-status";
import {
  isImageContentType,
  putImportedTaskAsset,
  taskAssetUploadLimitBytes,
} from "../../storage/s3";
import { normalizeApiServerUrl } from "../../utils/openapi-spec";
import type { OpenedImportSource } from "../source/open-import-source";

export type ImportTaskAttachments = {
  taskId: string;
  description: string;
  attachments: readonly ImportedAttachment[];
};

export type WriteImportAttachmentsInput = {
  opened: OpenedImportSource;
  workspaceId: string;
  projectId: string;
  userId: string;
  tasks: readonly ImportTaskAttachments[];
  signal: AbortSignal;
  status?: StorageBackendStatus | null;
};

export type WriteImportAttachmentsResult = {
  imported: number;
  warnings: string[];
};

// Matches the planned tasks with the attachments their source issue carried.
export function planImportAttachments(
  planned: ReadonlyArray<{
    key: string;
    id: string;
    description: string;
  }>,
  imported: ReadonlyArray<{
    key: string;
    attachments?: ImportedAttachment[];
  }>,
): ImportTaskAttachments[] {
  const attachmentsByKey = new Map(
    imported
      .filter((task) => (task.attachments?.length ?? 0) > 0)
      .map((task) => [task.key, task.attachments as ImportedAttachment[]]),
  );

  return planned
    .filter((task) => attachmentsByKey.has(task.key))
    .map((task) => ({
      taskId: task.id,
      description: task.description,
      attachments: attachmentsByKey.get(task.key) ?? [],
    }));
}

// shortcut: attachment links rely on KANEO_API_URL; a same-origin dev setup
// without it falls back to localhost, matching the asset URLs the API builds.
function assetUrl(assetId: string) {
  const base = normalizeApiServerUrl(
    process.env.KANEO_API_URL || "http://localhost:1337",
  );
  return `${base}/asset/${assetId}`;
}

function markdownText(value: string) {
  return value.replace(/[[\]\\]/g, "\\$&");
}

export function attachmentMarkdown(
  assetId: string,
  attachment: ImportedAttachment,
  contentType: string,
) {
  const url = assetUrl(assetId);
  const name = markdownText(attachment.filename);
  return isImageContentType(contentType)
    ? `![${name}](${url})`
    : `[${name}](${url})`;
}

export function appendAttachmentsToDescription(
  description: string,
  links: readonly string[],
) {
  const section = links.map((link) => `- ${link}`).join("\n");
  return `${description}\n\n**Attachments**\n\n${section}`;
}

export function attachmentsUnavailableWarning(
  total: number,
  status: StorageBackendStatus | null,
) {
  const count = total === 1 ? "1 attachment was" : `${total} attachments were`;
  const reason = status?.message ?? "S3 uploads are not configured.";
  return `${count} not imported: ${reason}`;
}

export function importLimitWarning(oversize: number, limitBytes: number) {
  const limit = Math.floor(limitBytes / (1024 * 1024));
  return oversize === 1
    ? `1 attachment exceeds the ${limit}MB upload limit and was not imported.`
    : `${oversize} attachments exceed the ${limit}MB upload limit and were not imported.`;
}

// Copies each source attachment into the storage backend, one issue at a time,
// records it as a task asset, and links it from the task description.
export async function writeImportAttachments(
  input: WriteImportAttachmentsInput,
): Promise<WriteImportAttachmentsResult> {
  const total = input.tasks.reduce(
    (sum, task) => sum + task.attachments.length,
    0,
  );
  if (total === 0) return { imported: 0, warnings: [] };

  const download = input.opened.source.downloadAttachment;
  if (!download) return { imported: 0, warnings: [] };

  const status =
    input.status !== undefined ? input.status : getStorageBackendStatus();
  if (!status?.available) {
    return {
      imported: 0,
      warnings: [attachmentsUnavailableWarning(total, status ?? null)],
    };
  }

  const limit = taskAssetUploadLimitBytes();
  let imported = 0;
  let failed = 0;
  let oversize = 0;

  for (const task of input.tasks) {
    const links: string[] = [];

    for (const attachment of task.attachments) {
      if (input.signal.aborted) break;
      if (typeof attachment.size === "number" && attachment.size > limit) {
        oversize++;
        continue;
      }

      try {
        const downloaded = await download(attachment, {
          signal: input.signal,
        });
        if (downloaded.body.byteLength > limit) {
          oversize++;
          continue;
        }

        const contentType = (
          downloaded.contentType?.split(";")[0] ||
          attachment.mimeType ||
          "application/octet-stream"
        )
          .trim()
          .toLowerCase();
        const objectKey = await putImportedTaskAsset({
          workspaceId: input.workspaceId,
          projectId: input.projectId,
          taskId: task.taskId,
          surface: "description",
          filename: attachment.filename,
          contentType,
          body: new Uint8Array(downloaded.body),
        });
        const [asset] = await db
          .insert(assetTable)
          .values({
            workspaceId: input.workspaceId,
            projectId: input.projectId,
            taskId: task.taskId,
            objectKey,
            filename: attachment.filename,
            mimeType: contentType,
            size: downloaded.body.byteLength,
            kind: isImageContentType(contentType) ? "image" : "attachment",
            surface: "description",
            createdBy: input.userId,
          })
          .returning({ id: assetTable.id });
        if (!asset) throw new Error("The asset record was not created.");

        links.push(attachmentMarkdown(asset.id, attachment, contentType));
        imported++;
      } catch (error) {
        if (input.signal.aborted) break;
        failed++;
        console.error(
          `Import could not copy the attachment "${attachment.filename}":`,
          describeStorageError(error),
        );
      }
    }

    if (links.length > 0) {
      await db
        .update(taskTable)
        .set({
          description: appendAttachmentsToDescription(task.description, links),
        })
        .where(eq(taskTable.id, task.taskId));
    }

    if (input.signal.aborted) break;
  }

  const warnings: string[] = [];
  if (failed > 0) {
    warnings.push(
      failed === 1
        ? "1 attachment could not be copied from the source."
        : `${failed} attachments could not be copied from the source.`,
    );
  }
  if (oversize > 0) warnings.push(importLimitWarning(oversize, limit));

  return { imported, warnings };
}
