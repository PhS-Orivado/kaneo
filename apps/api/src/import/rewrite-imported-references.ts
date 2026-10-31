import { and, eq, inArray } from "drizzle-orm";
import db from "../database";
import {
  activityTable,
  importReferenceTable,
  taskTable,
} from "../database/schema";
import { publishEvent } from "../events";
import updateTaskDescription from "../task/controllers/update-task-description";

export type ImportedTaskReference = {
  sourceLabel: string | null;
  sourceUrl: string | null;
  projectId: string;
  taskId: string;
};

export type ReferenceLinkRewrite = {
  pattern: RegExp;
  replacement: string;
};

export type RewriteImportedReferencesInput = {
  workspaceId: string;
  userId: string;
  projectIds: string[];
};

export type RewriteImportedReferencesResult = {
  updatedTasks: number;
  updatedComments: number;
  removedReferences: number;
};

const URL_BOUNDARY = String.raw`(?![\w/])`;
const RELATIVE_START = String.raw`(?<![\w])`;
const LABEL_START = String.raw`(?<![\w/.:\-\[])`;
const LABEL_END = String.raw`(?![\w/\]])`;

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sourceUrlPath(url: string): string | null {
  try {
    const path = new URL(url).pathname;
    return path && path !== "/" ? path : null;
  } catch {
    return null;
  }
}

/**
 * Builds one rewrite per way a source task can be referenced in text: its
 * canonical URL, absolute or relative, and the bare human key such as
 * "ABC-123". Bare keys are turned into Markdown links to the Kaneo task.
 */
export function buildReferenceLinkRewrites(
  references: readonly ImportedTaskReference[],
  internalUrlFor: (reference: ImportedTaskReference) => string,
): ReferenceLinkRewrite[] {
  const rewrites: ReferenceLinkRewrite[] = [];

  for (const reference of references) {
    const internalUrl = internalUrlFor(reference);

    if (reference.sourceUrl) {
      rewrites.push({
        pattern: new RegExp(
          `${escapeRegExp(reference.sourceUrl)}${URL_BOUNDARY}`,
          "g",
        ),
        replacement: internalUrl,
      });
      const path = sourceUrlPath(reference.sourceUrl);
      if (path) {
        rewrites.push({
          pattern: new RegExp(
            `${RELATIVE_START}${escapeRegExp(path)}${URL_BOUNDARY}`,
            "g",
          ),
          replacement: internalUrl,
        });
      }
    }

    if (reference.sourceLabel) {
      rewrites.push({
        pattern: new RegExp(
          `${LABEL_START}${escapeRegExp(reference.sourceLabel)}${LABEL_END}`,
          "g",
        ),
        replacement: `[${reference.sourceLabel}](${internalUrl})`,
      });
    }
  }

  return rewrites;
}

export function rewriteReferenceLinks(
  text: string,
  rewrites: readonly ReferenceLinkRewrite[],
): string {
  let updated = text;
  for (const rewrite of rewrites) {
    updated = updated.replace(rewrite.pattern, () => rewrite.replacement);
  }
  return updated;
}

/**
 * Updates every reference to a source task inside the imported projects'
 * descriptions and comments to point at the Kaneo task, then removes the
 * import references: once nothing points at the source system anymore, the
 * mapping itself is the last remaining link and goes too. A failure keeps
 * the references, so the pass can simply be run again.
 */
export async function rewriteImportedReferences({
  workspaceId,
  userId,
  projectIds,
}: RewriteImportedReferencesInput): Promise<RewriteImportedReferencesResult> {
  if (projectIds.length === 0) {
    return { updatedTasks: 0, updatedComments: 0, removedReferences: 0 };
  }

  const taskReferences = await db
    .select({
      sourceLabel: importReferenceTable.sourceLabel,
      sourceUrl: importReferenceTable.sourceUrl,
      projectId: importReferenceTable.projectId,
      taskId: importReferenceTable.taskId,
    })
    .from(importReferenceTable)
    .where(
      and(
        inArray(importReferenceTable.projectId, projectIds),
        eq(importReferenceTable.entityType, "task"),
      ),
    );

  const clientUrl = process.env.KANEO_CLIENT_URL || "http://localhost:5173";
  const rewrites = buildReferenceLinkRewrites(taskReferences, (reference) =>
    `${clientUrl}/dashboard/workspace/${workspaceId}/project/${reference.projectId}/task/${reference.taskId}`,
  );

  let updatedTasks = 0;
  let updatedComments = 0;

  if (rewrites.length > 0) {
    const tasks = await db
      .select({
        id: taskTable.id,
        description: taskTable.description,
      })
      .from(taskTable)
      .where(inArray(taskTable.projectId, projectIds));

    for (const task of tasks) {
      if (!task.description) continue;
      const rewritten = rewriteReferenceLinks(task.description, rewrites);
      if (rewritten === task.description) continue;
      await updateTaskDescription({
        id: task.id,
        description: rewritten,
        currentUserId: userId,
      });
      updatedTasks += 1;
    }

    const comments = await db
      .select({
        id: activityTable.id,
        content: activityTable.content,
        projectId: taskTable.projectId,
      })
      .from(activityTable)
      .innerJoin(taskTable, eq(activityTable.taskId, taskTable.id))
      .where(
        and(
          inArray(taskTable.projectId, projectIds),
          eq(activityTable.type, "comment"),
        ),
      );

    for (const comment of comments) {
      if (!comment.content) continue;
      const rewritten = rewriteReferenceLinks(comment.content, rewrites);
      if (rewritten === comment.content) continue;
      const [updated] = await db
        .update(activityTable)
        .set({ content: rewritten })
        .where(
          and(
            eq(activityTable.id, comment.id),
            eq(activityTable.type, "comment"),
          ),
        )
        .returning();
      if (!updated) continue;
      await publishEvent("comment.updated", {
        ...updated,
        projectId: comment.projectId,
        userId,
      });
      updatedComments += 1;
    }
  }

  const removed = await db
    .delete(importReferenceTable)
    .where(inArray(importReferenceTable.projectId, projectIds))
    .returning({ id: importReferenceTable.id });

  return {
    updatedTasks,
    updatedComments,
    removedReferences: removed.length,
  };
}
