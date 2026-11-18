import { and, eq, inArray, like } from "drizzle-orm";
import db from "../../database";
import { activityTable, projectTable, taskTable } from "../../database/schema";
import { publishEvent } from "../../events";
import updateTaskDescription from "../../task/controllers/update-task-description";
import { buildJiraLinkResolver } from "../jira-links/build-jira-link-resolver";
import { rewriteJiraLinksInText } from "../jira-links/rewrite-jira-links-in-text";

export type JiraLinkRewriteReport = {
  dryRun: boolean;
  replacements: {
    sourceUrl: string;
    targetUrl: string;
    targetTicketId: string;
    targetTitle: string;
    taskId: string;
    commentId: string | null;
  }[];
  unresolved: { url: string; taskId: string; commentId: string | null }[];
  updatedTasks: number;
  updatedComments: number;
};

type RewriteJiraLinksInput = {
  workspaceId: string;
  userId: string;
  dryRun: boolean;
  /** When set, only these projects' text is rewritten; links still resolve against the whole workspace. */
  projectIds?: string[];
};

async function rewriteJiraLinks({
  workspaceId,
  userId,
  dryRun,
  projectIds,
}: RewriteJiraLinksInput): Promise<JiraLinkRewriteReport> {
  const scoped = projectIds?.length
    ? inArray(taskTable.projectId, projectIds)
    : undefined;

  const projects = await db
    .select({ id: projectTable.id, slug: projectTable.slug })
    .from(projectTable)
    .where(eq(projectTable.workspaceId, workspaceId));

  const tasks = await db
    .select({
      id: taskTable.id,
      projectId: taskTable.projectId,
      number: taskTable.number,
      title: taskTable.title,
    })
    .from(taskTable)
    .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
    .where(eq(projectTable.workspaceId, workspaceId));

  const resolveTask = buildJiraLinkResolver(projects, tasks);
  const clientUrl = process.env.KANEO_CLIENT_URL || "http://localhost:5173";

  const resolveLink = (projectKey: string, issueNumber: number) => {
    const target = resolveTask(projectKey, issueNumber);

    return target
      ? {
          url: `${clientUrl}/dashboard/workspace/${workspaceId}/project/${target.projectId}/task/${target.taskId}`,
          taskId: target.taskId,
          projectId: target.projectId,
        }
      : null;
  };

  const descriptions = await db
    .select({ id: taskTable.id, description: taskTable.description })
    .from(taskTable)
    .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
    .where(
      and(
        eq(projectTable.workspaceId, workspaceId),
        like(taskTable.description, "%/browse/%"),
        ...(scoped ? [scoped] : []),
      ),
    );

  const comments = await db
    .select({
      id: activityTable.id,
      taskId: activityTable.taskId,
      content: activityTable.content,
      projectId: taskTable.projectId,
    })
    .from(activityTable)
    .innerJoin(taskTable, eq(activityTable.taskId, taskTable.id))
    .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
    .where(
      and(
        eq(projectTable.workspaceId, workspaceId),
        eq(activityTable.type, "comment"),
        like(activityTable.content, "%/browse/%"),
        ...(scoped ? [scoped] : []),
      ),
    );

  const targetInfo = (projectId: string, taskId: string) => {
    const slug = projects.find((project) => project.id === projectId)?.slug;
    const task = tasks.find((row) => row.id === taskId);

    return {
      targetTicketId: slug && task?.number ? `${slug}-${task.number}` : "",
      targetTitle: task?.title ?? "",
    };
  };

  const replacements: JiraLinkRewriteReport["replacements"] = [];
  const unresolved: JiraLinkRewriteReport["unresolved"] = [];
  const taskPatches = new Map<string, string>();
  const commentPatches = new Map<string, string>();

  const plan = (
    content: string | null,
    taskId: string,
    commentId: string | null,
  ) => {
    if (!content) return;

    const result = rewriteJiraLinksInText(content, resolveLink);

    for (const replacement of result.replacements) {
      const info = targetInfo(
        replacement.targetProjectId,
        replacement.targetTaskId,
      );

      replacements.push({
        sourceUrl: replacement.sourceUrl,
        targetUrl: replacement.targetUrl,
        targetTicketId: info.targetTicketId,
        targetTitle: info.targetTitle,
        taskId,
        commentId,
      });
    }

    for (const url of result.unresolvedUrls) {
      unresolved.push({ url, taskId, commentId });
    }

    if (result.text !== content) {
      if (commentId) commentPatches.set(commentId, result.text);
      else taskPatches.set(taskId, result.text);
    }
  };

  for (const task of descriptions) {
    plan(task.description, task.id, null);
  }

  for (const comment of comments) {
    plan(comment.content, comment.taskId, comment.id);
  }

  const updatedTasks = taskPatches.size;
  let updatedComments = 0;

  if (!dryRun) {
    for (const [taskId, description] of taskPatches) {
      await updateTaskDescription({
        id: taskId,
        description,
        currentUserId: userId,
      });
    }

    for (const [commentId, content] of commentPatches) {
      const [updated] = await db
        .update(activityTable)
        .set({ content })
        .where(
          and(eq(activityTable.id, commentId), eq(activityTable.type, "comment")),
        )
        .returning();

      if (!updated) continue;

      const comment = comments.find((row) => row.id === commentId);

      if (comment) {
        await publishEvent("comment.updated", {
          ...updated,
          projectId: comment.projectId,
          userId,
        });
      }

      updatedComments += 1;
    }
  } else {
    updatedComments = commentPatches.size;
  }

  return {
    dryRun,
    replacements,
    unresolved,
    updatedTasks,
    updatedComments,
  };
}

export default rewriteJiraLinks;
