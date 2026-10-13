import { acceptsIssue } from "../../sync/rules";
import { importIssueLabels } from "../../sync/issue-labels";
import { canSyncTask } from "../../sync/eligibility";
import { createIssueWrite } from "../../sync/dispatch-issue-write";
import { and, eq } from "drizzle-orm";
import db from "../../../database";
import {
  columnTable,
  integrationTable,
  projectTable,
  taskTable,
} from "../../../database/schema";
import { publishEvent } from "../../../events";
import { claimTaskNumber } from "../../../task/controllers/claim-task-numbers";
import {
  createExternalLink,
  findExternalLink,
} from "../../github/services/link-manager";
import { extractIssuePriority } from "../../github/utils/extract-priority";
import {
  formatTaskDescriptionFromJira,
  jiraIssueBrowseUrl,
} from "../utils/format";
import type { JiraConfig } from "../config";
import {
  baseUrlFromIssueSelf,
  findAllIntegrationsByJiraProject,
  projectKeyFromIssueKey,
} from "../services/integration-lookup";
import { createJiraClient } from "../utils/jira-api";
import { resolveTargetStatus } from "../utils/resolve-column";

type IssueCreatedPayload = {
  webhookEvent: string;
  issue: {
    id: string;
    key: string;
    self: string;
    fields: {
      summary: string;
      description?: string | null;
      status?: { name?: string; statusCategory?: { key?: string } } | null;
      labels?: string[];
      issuetype?: { name?: string; subtask?: boolean } | null;
      creator?: {
        accountId?: string;
        name?: string;
        displayName?: string;
      } | null;
      project?: { key?: string; name?: string } | null;
    };
  };
};

export async function handleJiraIssueCreated(
  payload: IssueCreatedPayload,
  integrationId?: string,
) {
  const { issue } = payload;

  if (issue.fields.issuetype?.subtask) {
    console.log("[Jira Webhook] Ignoring created subtask", {
      issueKey: issue.key,
    });
    return;
  }

  const baseUrl = baseUrlFromIssueSelf(issue.self);
  if (!baseUrl) return;

  const projectKey =
    issue.fields.project?.key ?? projectKeyFromIssueKey(issue.key);
  const integrations = await findAllIntegrationsByJiraProject(
    baseUrl,
    projectKey,
    integrationId,
  );

  if (integrations.length === 0) {
    return;
  }

  for (const integration of integrations) {
    if (!acceptsIssue(integration.config, issue.fields.labels)) continue;
    let config: JiraConfig;
    try {
      config = JSON.parse(integration.config) as JiraConfig;
    } catch (error) {
      console.error("Invalid Jira config for integration", {
        integrationId: integration.id,
        error,
      });
      continue;
    }
    const projectId = integration.projectId;
    const closed = issue.fields.status?.statusCategory?.key === "done";

    // An issue created by Kaneo's own token is our outbound issue, not an
    // inbound one; the external link check below covers the common case and
    // this closes the delivery race.
    if (
      config.selfAccountId &&
      issue.fields.creator?.accountId &&
      issue.fields.creator.accountId === config.selfAccountId
    ) {
      continue;
    }

    const priority = extractIssuePriority(issue.fields.labels);

    const result = await db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(integrationTable)
        .where(eq(integrationTable.id, integration.id))
        .for("update");
      if (
        !current?.isActive ||
        current.config !== integration.config ||
        !acceptsIssue(current.config, issue.fields.labels)
      )
        return null;
      if (await findExternalLink(integration.id, "issue", issue.key, tx))
        return null;
      const resolvedStatus = await resolveTargetStatus(
        projectId,
        closed ? "issue_closed" : "issue_opened",
        closed ? "done" : "to-do",
        tx,
        integration.id,
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
      const nextTaskNumber = await claimTaskNumber(projectId, tx);
      const [task] = await tx
        .insert(taskTable)
        .values({
          projectId,
          userId: null,
          title: issue.fields.summary,
          description: formatTaskDescriptionFromJira(issue.fields.description),
          status: closed ? (targetColumn?.slug ?? "done") : resolvedStatus,
          columnId: targetColumn?.id ?? null,
          priority: priority ?? "low",
          number: nextTaskNumber,
        })
        .returning();
      if (!task) throw new Error("Failed to create task from jira issue");
      const linkMetadata = {
        state: closed ? "closed" : "open",
        createdFrom: "jira",
        author: issue.fields.creator?.displayName ?? issue.fields.creator?.name,
      };
      const link = await createExternalLink(
        {
          taskId: task.id,
          integrationId: integration.id,
          resourceType: "issue",
          externalId: issue.key,
          url: jiraIssueBrowseUrl(config.baseUrl, issue.key),
          title: issue.fields.summary,
          metadata: linkMetadata,
        },
        tx,
      );
      await importIssueLabels(
        task.id,
        integration.project.workspaceId,
        issue.fields.labels,
        tx,
      );
      const eligible = await canSyncTask(
        task.id,
        integration.id,
        tx,
        integration.config,
      );
      return { task, link, linkMetadata, eligible };
    });
    if (!result) continue;
    const { task: createdTask, link, eligible } = result;

    await publishEvent("task.created", {
      ...createdTask,
      taskId: createdTask.id,
      userId: createdTask.userId ?? "",
      type: "task",
      content: null,
      source: "jira",
      externalId: issue.key,
      actor: issue.fields.creator?.displayName ?? "jira-webhook",
    });
    if (!eligible) continue;
    const write = createIssueWrite(
      { id: link.id, taskId: createdTask.id, integrationId: integration.id },
      integration.config,
    );

    const project = await db.query.projectTable.findFirst({
      where: eq(projectTable.id, projectId),
    });

    if (!project) {
      continue;
    }

    const clientUrl = process.env.KANEO_CLIENT_URL || "http://localhost:5173";
    const taskUrl = `${clientUrl}/dashboard/workspace/${project.workspaceId}/project/${projectId}/task/${createdTask.id}`;
    const taskIdentifier = `${project.slug.toUpperCase()}-${createdTask.number}`;

    try {
      const client = createJiraClient(config);

      if (config.commentTaskLinkOnJiraIssue !== false) {
        await write(() =>
          client.addComment(issue.key, `[${taskIdentifier}](${taskUrl})`),
        );
      }
    } catch {
      console.error("Jira imported issue linking write failed", {
        projectId,
        taskId: createdTask.id,
        integrationId: integration.id,
        linkId: link.id,
      });
    }
  }
}
