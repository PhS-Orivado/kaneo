import type { ImportedProject, ImportSourceId } from "@kaneo/importers";
import { publishEvent } from "../events";
import type { ImportCounts, ImportStage } from "./import-run-project";
import type { OpenedImportSource } from "./source/open-import-source";
import { createImportProject } from "./writer/create-import-project";
import type { ImportUserHandling } from "./writer/plan-import-users";
import { writeProjectContent } from "./writer/write-project-content";
import { writeImportAttachments } from "./writer/write-import-attachments";

export type WriteImportedProjectInput = {
  workspaceId: string;
  userId: string;
  source: ImportSourceId;
  opened: OpenedImportSource;
  signal: AbortSignal;
  project: ImportedProject;
  includeComments: boolean;
  userHandling: ImportUserHandling;
  onStage?: (stage: ImportStage) => void;
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
  opened,
  signal,
  project,
  includeComments,
  userHandling,
  onStage,
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
        userHandling,
        onStage,
      })),
    }),
  );

  // Attachments are copied outside the project transaction: each download and
  // upload is slow network I/O, and a single attachment failing must not roll
  // back the imported project.
  const attachments = await writeImportAttachments({
    opened,
    workspaceId,
    projectId: written.projectId,
    userId,
    tasks: written.attachments,
    signal,
  });

  await publishEvent("project.updated", { projectId: written.projectId });

  return {
    projectId: written.projectId,
    projectSlug: written.projectSlug,
    counts: {
      ...written.counts,
      attachments: attachments.imported,
    },
    warnings: [...written.warnings, ...attachments.warnings],
  };
}
