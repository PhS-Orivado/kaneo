import type { ImportedProject, ImportSourceId } from "@kaneo/importers";
import { publishEvent } from "../events";
import type { ImportCounts } from "./import-run-project";
import { createImportProject } from "./writer/create-import-project";
import type { ImportAttachmentDownloader } from "./writer/write-import-attachments";
import { writeProjectContent } from "./writer/write-project-content";

export type WriteImportedProjectInput = {
  workspaceId: string;
  userId: string;
  source: ImportSourceId;
  project: ImportedProject;
  includeComments: boolean;
  downloadAttachment?: ImportAttachmentDownloader;
  onProgress?: (message: string) => void;
};

export type WrittenImportProject = {
  projectId: string;
  projectSlug: string;
  counts: ImportCounts;
  warnings: string[];
};

export async function writeImportedProject({
  workspaceId,
  userId,
  source,
  project,
  includeComments,
  downloadAttachment,
  onProgress,
}: WriteImportedProjectInput): Promise<WrittenImportProject> {
  const written = await createImportProject(
    {
      workspaceId,
      name: project.name.trim() || "Untitled project",
      userId,
      preferredKey: project.key,
    },
    async (tx, created) => ({
      projectId: created.id,
      projectSlug: created.slug,
      ...(await writeProjectContent(tx, {
        projectId: created.id,
        workspaceId,
        userId,
        source,
        project,
        includeComments,
        downloadAttachment,
        onProgress,
      })),
    }),
  );

  await publishEvent("project.updated", { projectId: written.projectId });

  return written;
}
