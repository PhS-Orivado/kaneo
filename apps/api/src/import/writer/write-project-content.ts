import type { ImportedProject, ImportSourceId } from "@kaneo/importers";
import { createId } from "@paralleldrive/cuid2";
import { eq, sql } from "drizzle-orm";
import type db from "../../database";
import {
  assetTable,
  importReferenceTable,
  projectTable,
} from "../../database/schema";
import { normalizeApiServerUrl } from "../../utils/openapi-spec";
import type { ImportCounts } from "../import-run-project";
import { assignImportTaskNumbers } from "./assign-import-task-numbers";
import { chunk } from "./chunk";
import { loadAssignableMembers } from "./load-assignable-members";
import { createAssigneeMatcher } from "./match-assignees";
import { planImportColumns } from "./plan-import-columns";
import { planImportRelations } from "./plan-import-relations";
import { planImportTasks } from "./plan-import-tasks";
import { rewriteAttachmentLinks } from "./rewrite-attachment-links";
import {
  writeImportAttachments,
  type ImportAttachmentDownloader,
} from "./write-import-attachments";
import { writeImportColumns } from "./write-import-columns";
import { writeImportComments } from "./write-import-comments";
import { writeImportLabels } from "./write-import-labels";
import { writeImportRelations } from "./write-import-relations";
import { writeImportSprints } from "./write-import-sprints";
import { writeImportTasks } from "./write-import-tasks";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type ProjectContentInput = {
  projectId: string;
  workspaceId: string;
  userId: string;
  source: ImportSourceId;
  project: ImportedProject;
  includeComments: boolean;
  downloadAttachment?: ImportAttachmentDownloader;
  onProgress?: (message: string) => void;
};

export async function writeProjectContent(
  tx: Transaction,
  {
    projectId,
    workspaceId,
    userId,
    source,
    project,
    includeComments,
    downloadAttachment,
    onProgress,
  }: ProjectContentInput,
): Promise<{ counts: ImportCounts; warnings: string[] }> {
  const now = new Date();
  const description = project.description?.trim();
  if (description) {
    await tx
      .update(projectTable)
      .set({ description })
      .where(eq(projectTable.id, projectId));
  }

  const columnPlan = planImportColumns(project.columns);
  const board = await writeImportColumns(tx, projectId, columnPlan);
  const assignees = createAssigneeMatcher(
    await loadAssignableMembers(tx, workspaceId, projectId),
  );

  onProgress?.("Creating sprints");
  const sprintIds = await writeImportSprints(tx, projectId, project.sprints ?? []);

  const { numbers, lastNumber } = assignImportTaskNumbers(project.tasks);
  if (lastNumber > 0) {
    await tx
      .update(projectTable)
      .set({
        lastTaskNumber: sql`GREATEST(${projectTable.lastTaskNumber}, ${lastNumber})`,
      })
      .where(eq(projectTable.id, projectId));
  }
  const tasks = planImportTasks({
    tasks: project.tasks,
    columns: board.byKey,
    fallbackColumn: board.fallback,
    numbers,
    now,
    newId: createId,
    assign: assignees.match,
    sprints: sprintIds,
  });

  // Attachment bytes are moved before the tasks are written so their URLs can
  // be rewritten inside descriptions and comments on the way in; the asset
  // rows themselves wait for the tasks, which they reference.
  const attachments = await writeImportAttachments({
    workspaceId,
    projectId,
    userId,
    tasks,
    download: downloadAttachment,
    assetUrl: importedAssetUrl,
    onProgress,
  });
  const rewrittenTasks = tasks.map((task) => ({
    ...task,
    description: rewriteAttachmentLinks(task.description, attachments.rewrites),
    comments: task.comments.map((comment) => ({
      ...comment,
      body: rewriteAttachmentLinks(comment.body, attachments.rewrites),
    })),
  }));

  await writeImportTasks(tx, projectId, userId, rewrittenTasks);
  for (const batch of chunk(attachments.rows)) {
    await tx.insert(assetTable).values(batch);
  }

  const labels = await writeImportLabels(
    tx,
    workspaceId,
    project.labels,
    rewrittenTasks,
  );

  const comments = includeComments
    ? await writeImportComments(tx, {
        tasks: rewrittenTasks,
        importedBy: userId,
        source,
        now,
      })
    : { count: 0, references: [] };

  const relations = await writeImportRelations(
    tx,
    planImportRelations(
      project.relations,
      new Map(rewrittenTasks.map((task) => [task.key, task.id])),
    ),
  );

  // Every imported entity is recorded with a reference to its source, so the
  // links and mentions inside imported text can be updated to the internal
  // Kaneo ones once all projects of the import exist.
  const referenceRows: (typeof importReferenceTable.$inferInsert)[] = [
    ...[...board.byKey].map(([sourceKey, column]) => ({
      id: createId(),
      workspaceId,
      projectId,
      source,
      entityType: "column",
      sourceKey,
      columnId: column.id,
    })),
    ...[...sprintIds].map(([sourceKey, sprintId]) => ({
      id: createId(),
      workspaceId,
      projectId,
      source,
      entityType: "sprint",
      sourceKey,
      sprintId,
    })),
    ...tasks.map((task) => ({
      id: createId(),
      workspaceId,
      projectId,
      source,
      entityType: "task",
      sourceKey: task.key,
      ...(task.sourceLabel ? { sourceLabel: task.sourceLabel } : {}),
      ...(task.sourceUrl ? { sourceUrl: task.sourceUrl } : {}),
      taskId: task.id,
    })),
    ...attachments.references.map(({ sourceKey, assetId }) => ({
      id: createId(),
      workspaceId,
      projectId,
      source,
      entityType: "asset",
      sourceKey,
      assetId,
    })),
    ...comments.references.map(({ sourceKey, activityId }) => ({
      id: createId(),
      workspaceId,
      projectId,
      source,
      entityType: "comment",
      sourceKey,
      activityId,
    })),
  ];
  for (const batch of chunk(referenceRows)) {
    await tx.insert(importReferenceTable).values(batch);
  }

  const unmatched = assignees.warning();
  return {
    counts: {
      columns: board.count,
      tasks: rewrittenTasks.length,
      labels,
      comments: comments.count,
      assignees: rewrittenTasks.filter((task) => task.userId).length,
      relations,
      sprints: (project.sprints ?? []).length,
      attachments: attachments.count,
    },
    warnings: [
      ...project.warnings,
      ...columnPlan.warnings,
      ...attachments.warnings,
      ...(unmatched ? [unmatched] : []),
    ],
  };
}

function importedAssetUrl(assetId: string): string {
  const base = normalizeApiServerUrl(
    process.env.KANEO_API_URL || "http://localhost:1337",
  );
  return `${base}/asset/${assetId}`;
}
