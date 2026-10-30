import type {
  DownloadedAttachment,
  ImportedAttachment,
} from "@kaneo/importers";
import { createId } from "@paralleldrive/cuid2";
import { assetTable } from "../../database/schema";
import {
  isImageContentType,
  isStorageConfigured,
  putTaskAssetObject,
} from "../../storage/s3";
import {
  buildAttachmentLinkRewrites,
  type AttachmentLinkRewrite,
} from "./rewrite-attachment-links";
import type { PlannedImportTask } from "./plan-import-tasks";

export type ImportAttachmentDownloader = (
  attachment: ImportedAttachment,
) => Promise<DownloadedAttachment>;

export type WriteImportAttachmentsInput = {
  workspaceId: string;
  projectId: string;
  userId: string;
  tasks: readonly PlannedImportTask[];
  download: ImportAttachmentDownloader | undefined;
  assetUrl: (assetId: string) => string;
  onProgress?: (message: string) => void;
};

export type WrittenImportAttachments = {
  count: number;
  warnings: string[];
  /** Replaces every source attachment URL with its Kaneo asset URL. */
  rewrites: AttachmentLinkRewrite[];
  /** Asset rows to insert once the tasks they belong to exist. */
  rows: (typeof assetTable.$inferInsert)[];
  /** Maps each attachment's source id to the asset it was written as. */
  references: Array<{ sourceKey: string; assetId: string }>;
};

const NO_STORAGE_WARNING =
  "Attachments were not imported because file storage is not configured.";

export async function writeImportAttachments(
  {
    workspaceId,
    projectId,
    userId,
    tasks,
    download,
    assetUrl,
    onProgress,
  }: WriteImportAttachmentsInput,
): Promise<WrittenImportAttachments> {
  const withAttachments = tasks.flatMap((task) =>
    (task.attachments ?? []).map((attachment) => ({ task, attachment })),
  );

  if (withAttachments.length === 0) {
    return { count: 0, warnings: [], rewrites: [], rows: [], references: [] };
  }

  if (!download || !isStorageConfigured()) {
    return {
      count: 0,
      warnings: [NO_STORAGE_WARNING],
      rewrites: [],
      rows: [],
      references: [],
    };
  }

  const rows: (typeof assetTable.$inferInsert)[] = [];
  const references: WrittenImportAttachments["references"] = [];
  const urlById = new Map<string, string>();
  const failures: string[] = [];
  let done = 0;

  for (const { task, attachment } of withAttachments) {
    done += 1;
    onProgress?.(
      `Downloading attachments (${done} of ${withAttachments.length})`,
    );
    try {
      const downloaded = await download(attachment);
      const contentType = downloaded.contentType || attachment.mimeType;
      const { key } = await putTaskAssetObject({
        workspaceId,
        projectId,
        taskId: task.id,
        surface: "description",
        filename: attachment.filename,
        contentType,
        size: downloaded.size,
        body: Buffer.from(downloaded.body),
      });
      const assetId = createId();
      urlById.set(attachment.id, assetUrl(assetId));
      references.push({ sourceKey: attachment.id, assetId });
      rows.push({
        id: assetId,
        workspaceId,
        projectId,
        taskId: task.id,
        objectKey: key,
        filename: attachment.filename,
        mimeType: contentType,
        size: downloaded.size,
        kind: isImageContentType(contentType) ? "image" : "attachment",
        surface: "description",
        createdBy: userId,
      });
    } catch {
      failures.push(attachment.filename);
    }
  }

  const rewrites = buildAttachmentLinkRewrites(
    withAttachments.map(({ attachment }) => attachment),
    (id) => urlById.get(id) ?? null,
  );

  return {
    count: rows.length,
    warnings: [
      ...(failures.length > 0
        ? [
            failures.length === 1
              ? `1 attachment could not be imported: ${failures[0]}`
              : `${failures.length} attachments could not be imported: ${failures.slice(0, 5).join(", ")}${failures.length > 5 ? ", …" : ""}`,
          ]
        : []),
    ],
    rewrites,
    rows,
    references,
  };
}
