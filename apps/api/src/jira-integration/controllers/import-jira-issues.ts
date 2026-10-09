import { acceptsIssue } from "../../plugins/sync/rules";
import { canSyncTask } from "../../plugins/sync/eligibility";
import { sameConfig } from "../../plugins/sync/same-config";
import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import {
  activityTable,
  columnTable,
  externalLinkTable,
  integrationTable,
  projectTable,
  taskTable,
} from "../../database/schema";
import { publishEvent } from "../../events";
import type { JiraConfig } from "../../plugins/jira/config";
import { isKaneoComment } from "../../plugins/jira/utils/comment-origin";
import {
  createJiraClient,
  type JiraComment,
  type JiraIssue,
} from "../../plugins/jira/utils/jira-api";
import {
  jiraCommentUrl,
  jiraIssueBrowseUrl,
  formatTaskDescriptionFromJira,
} from "../../plugins/jira/utils/format";
import { kaneoPriorityForJiraName } from "../../plugins/jira/utils/priority";
import { resolveTargetStatus } from "../../plugins/jira/utils/resolve-column";
import {
  createExternalLink,
  findExternalLink,
} from "../../plugins/github/services/link-manager";
import { extractIssuePriority } from "../../plugins/github/utils/extract-priority";
import { claimTaskNumber } from "../../task/controllers/claim-task-numbers";

import {
  type IntegrationDatabase,
  linkedTaskScope,
  withIntegrationTask,
} from "../../plugins/github/services/integration-task-scope";
import { syncJiraLabelsToTask } from "../../plugins/jira/services/labels";

type ImportResult = {
  imported: number;
  updated: number;
  skipped: number;
  errors?: string[];
};

// Imports are keyed by integration id, so every binding keeps its own issue
// links. When a projectId is also provided (compat with the old
// project-keyed body), it must match the binding's project; a mismatch is a
// 404, never a 403, so the endpoint does not confirm the existence of a
// foreign binding. Refreshes never touch task status: statuses flow inbound
// through webhook transitions, so an import can never fight the workflow.
export async function importJiraIssues({
  integrationId,
  projectId: expectedProjectId,
}: {
  integrationId: string;
  projectId?: string;
}): Promise<ImportResult> {
  const errors: string[] = [];
  let imported = 0;
  let updated = 0;
  let skipped = 0;

  const integration = await db.query.integrationTable.findFirst({
    where: and(
      eq(integrationTable.id, integrationId),
      eq(integrationTable.type, "jira"),
    ),
  });

  if (!integration) {
    throw new HTTPException(404, { message: "Jira integration not found" });
  }

  const projectId = integration.projectId;
  if (expectedProjectId && expectedProjectId !== projectId) {
    throw new HTTPException(404, { message: "Jira integration not found" });
  }

  const project = await db.query.projectTable.findFirst({
    where: eq(projectTable.id, projectId),
  });

  if (!project) {
    throw new HTTPException(404, { message: "Project not found" });
  }

  if (!integration.isActive) {
    throw new HTTPException(400, {
      message: "Jira integration is not active",
    });
  }

  let config: JiraConfig;
  try {
    config = JSON.parse(integration.config) as JiraConfig;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn("Invalid Jira integration config JSON", {
      integrationId: integration.id,
      error,
    });
    throw new HTTPException(400, {
      message: `Invalid Jira integration config: ${message}`,
    });
  }

  if (!config.apiToken || !config.baseUrl || !config.projectKey) {
    throw new HTTPException(400, {
      message: "Jira token, base URL, or project key not configured",
    });
  }

  const client = createJiraClient(config);

  const allIssues: JiraIssue[] = [];
  let startAt = 0;

  while (true) {
    const { issues, total } = await client.searchIssues(
      config.projectKey,
      startAt,
      50,
    );

    if (issues.length === 0) break;

    allIssues.push(...issues.filter((issue) => !issue.fields.issuetype?.subtask));

    startAt += issues.length;
    if (startAt >= total) break;
  }

  for (const issue of allIssues) {
    try {
      const result = await importSingleIssue(
        issue,
        integration.id,
        projectId,
        project.workspaceId,
        config,
        client,
      );

      if (result === "imported") {
        imported++;
      } else if (result === "updated") {
        updated++;
      } else {
        skipped++;
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      errors.push(`Issue ${issue.key}: ${errorMessage}`);
    }
  }

  return {
    imported,
    updated,
    skipped,
    ...(errors.length > 0 ? { errors } : {}),
  };
}

async function importSingleIssue(
  issue: JiraIssue,
  integrationId: string,
  projectId: string,
  workspaceId: string,
  config: JiraConfig,
  client: ReturnType<typeof createJiraClient>,
): Promise<"imported" | "updated" | "skipped"> {
  const existingLink = await findExternalLink(
    integrationId,
    "issue",
    issue.key,
  );

  if (!existingLink && !acceptsIssue(config, issue.fields.labels))
    return "skipped";

  const labels = issue.fields.labels ?? [];
  const priority =
    kaneoPriorityForJiraName(issue.fields.priority?.name) ??
    extractIssuePriority(labels);

  const comments = await fetchIssueComments(issue.key, client);

  if (existingLink) {
    const result = await withIntegrationTask(
      existingLink.taskId,
      { id: integrationId, projectId, project: { workspaceId } },
      async (database, afterCommit) => {
        const [linked] = await database
          .select({ id: externalLinkTable.id })
          .from(externalLinkTable)
          .where(
            and(
              eq(externalLinkTable.id, existingLink.id),
              eq(externalLinkTable.taskId, existingLink.taskId),
              eq(externalLinkTable.integrationId, integrationId),
            ),
          )
          .for("update");
        if (
          !linked ||
          !(await canSyncTask(existingLink.taskId, integrationId, database))
        )
          return "skipped" as const;

        const updateData: Record<string, unknown> = {
          title: issue.fields.summary,
          description: formatTaskDescriptionFromJira(
            issue.fields.description,
            existingLink.taskId,
          ),
        };

        if (priority) updateData.priority = priority;

        await database
          .update(taskTable)
          .set(updateData)
          .where(linkedTaskScope(existingLink.taskId, projectId));

        await syncJiraLabelsToTask(
          existingLink.taskId,
          workspaceId,
          labels,
          database,
        );

        await importCommentsForTask(
          comments,
          issue.key,
          config,
          existingLink.taskId,
          database,
        );

        afterCommit(async () => {
          for (const type of [
            "task.updated",
            "task.labels_updated",
            "comment.updated",
          ])
            await publishEvent(type, {
              projectId,
              taskId: existingLink.taskId,
            });
        });
        return "updated" as const;
      },
    );
    return result ?? "skipped";
  }

  const closed = issue.fields.status?.statusCategory?.key === "done";

  const createdTask = await withIntegrationTask(
    null,
    { id: integrationId, projectId, project: { workspaceId } },
    async (tx) => {
      const binding = await tx.query.integrationTable.findFirst({
        where: eq(integrationTable.id, integrationId),
      });
      if (
        !binding ||
        !sameConfig(binding.config, JSON.stringify(config)) ||
        !acceptsIssue(binding.config, issue.fields.labels) ||
        (await findExternalLink(integrationId, "issue", issue.key, tx))
      )
        return null;

      const resolvedStatus = await resolveTargetStatus(
        projectId,
        closed ? "issue_closed" : "issue_opened",
        closed ? "done" : "to-do",
        tx,
        integrationId,
        issue.fields.status?.name,
      );
      let targetColumn = await tx.query.columnTable.findFirst({
        where: and(
          eq(columnTable.projectId, projectId),
          eq(columnTable.slug, resolvedStatus),
        ),
      });
      if (closed && !targetColumn?.isFinal)
        targetColumn = await tx.query.columnTable.findFirst({
          where: and(
            eq(columnTable.projectId, projectId),
            eq(columnTable.isFinal, true),
          ),
          orderBy: (column, { asc }) => [asc(column.position)],
        });

      const nextNumber = await claimTaskNumber(projectId, tx);

      const taskValues: typeof taskTable.$inferInsert = {
        projectId,
        userId: null,
        title: issue.fields.summary,
        description: formatTaskDescriptionFromJira(
          issue.fields.description,
          undefined,
        ),
        status: closed ? (targetColumn?.slug ?? "done") : resolvedStatus,
        columnId: targetColumn?.id ?? null,
        priority: priority ?? "low",
        number: nextNumber,
      };

      const [created] = await tx
        .insert(taskTable)
        .values(taskValues)
        .returning();

      if (!created) {
        throw new Error("Failed to create task");
      }

      await createExternalLink(
        {
          taskId: created.id,
          integrationId,
          resourceType: "issue",
          externalId: issue.key,
          url: jiraIssueBrowseUrl(config.baseUrl, issue.key),
          title: issue.fields.summary,
          metadata: {
            state: closed ? "closed" : "open",
            createdFrom: "jira-import",
            author:
              issue.fields.creator?.displayName ?? issue.fields.creator?.name,
          },
        },
        tx,
      );

      await syncJiraLabelsToTask(created.id, workspaceId, labels, tx);
      await canSyncTask(created.id, integrationId, tx, binding.config);

      await importCommentsForTask(comments, issue.key, config, created.id, tx);

      return created;
    },
  );
  if (!createdTask) return "skipped";

  await publishEvent("task.created", {
    ...createdTask,
    taskId: createdTask.id,
    userId: createdTask.userId ?? "",
    type: "task",
    content: null,
    source: "jira-import",
    integrationId,
    externalId: issue.key,
  });

  return "imported";
}

async function fetchIssueComments(
  issueKey: string,
  client: ReturnType<typeof createJiraClient>,
): Promise<JiraComment[]> {
  const allComments: JiraComment[] = [];
  let startAt = 0;

  while (true) {
    const { comments, total } = await client.listComments(issueKey, startAt, 100);

    if (comments.length === 0) break;

    allComments.push(...comments);

    startAt += comments.length;
    if (startAt >= total) break;
  }

  return allComments;
}

async function importCommentsForTask(
  allComments: JiraComment[],
  issueKey: string,
  config: JiraConfig,
  taskId: string,
  database: IntegrationDatabase,
): Promise<void> {
  for (const comment of allComments) {
    // Comments authored by Kaneo's own token are outbound echoes.
    if (isKaneoComment(comment.body)) continue;
    if (
      config.selfAccountId &&
      comment.author?.accountId &&
      comment.author.accountId === config.selfAccountId
    ) {
      continue;
    }

    const username =
      comment.author?.displayName ?? comment.author?.name ?? "Unknown";

    await database
      .insert(activityTable)
      .values({
        taskId,
        type: "comment",
        content: comment.body,
        externalUserName: username || "Unknown",
        externalSource: "jira",
        externalUrl: jiraCommentUrl(config.baseUrl, issueKey, comment.id),
        eventData: {
          externalCommentId: comment.id,
        },
      })
      .onConflictDoNothing({
        target: [
          activityTable.taskId,
          activityTable.externalSource,
          activityTable.externalUrl,
        ],
      });
  }
}
