import type { ImportedProject, ImportSourceId } from "@kaneo/importers";
import { publishEvent } from "../events";
import type { ImportCounts, ImportStage } from "./import-run-project";
import { createImportProject } from "./writer/create-import-project";
import type { ImportUserHandling } from "./writer/plan-import-users";
import { writeProjectContent } from "./writer/write-project-content";

export type WriteImportedProjectInput = {
  workspaceId: string;
  userId: string;
  source: ImportSourceId;
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

  await publishEvent("project.updated", { projectId: written.projectId });

  return written;
}
