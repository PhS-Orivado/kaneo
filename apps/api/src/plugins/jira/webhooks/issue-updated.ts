import { issueEditScope } from "../../github/utils/deferred-issue-edit";
import { deferIssueEdit } from "../../github/services/deferred-issue-edits";
import { inboundStamp } from "../../github/utils/sync-echo";
import { publishEvent } from "../../../events";
import { withIntegrationLink } from "../../github/services/with-integration-link";
import type { JiraConfig } from "../config";
import { createJiraClient, type JiraChangelogItem } from "../utils/jira-api";
import {
  inboundEcho,
  PendingResponseTimeout,
  withEchoConfirmation,
} from "../../github/utils/inbound-echo";
import { linkedTaskScope } from "../../github/services/integration-task-scope";
import { taskTable } from "../../../database/schema";
import {
  findExternalLink,
  updateExternalLink,
} from "../../github/services/link-manager";
import { formatTaskDescriptionFromJira } from "../utils/format";
import type { SyncStamp } from "../../github/utils/sync-echo";
import {
  baseUrlFromIssueSelf,
  findAllIntegrationsByJiraProject,
  projectKeyFromIssueKey,
} from "../services/integration-lookup";
import {
  isTaskInFinalState,
  updateTaskStatus,
} from "../../github/services/task-service";
import {
  OUTBOUND_STATE_ECHO_WINDOW_MS,
  parseIssueUpdatedAtMs,
} from "../utils/outbound-echo";
import { resolveTargetStatus } from "../utils/resolve-column";
import { syncJiraLabelsToTask } from "../services/labels";

type IssueUpdatedPayload = {
  webhookEvent: string;
  issue: {
    id: string;
    key: string;
    self: string;
    fields: {
      summary: string;
      description?: string | null;
      status?: {
        name?: string;
        statusCategory?: { key?: string };
      } | null;
      labels?: string[];
      updated?: string;
      project?: { key?: string; name?: string } | null;
      creator?: { accountId?: string } | null;
    };
  };
  changelog?: { items?: JiraChangelogItem[] };
};

function textChanged(items: JiraChangelogItem[]): {
  title: boolean;
  description: boolean;
} {
  return {
    title: items.some((item) => item.field === "summary"),
    description: items.some((item) => item.field === "description"),
  };
}

export async function handleJiraIssueUpdated(
  payload: IssueUpdatedPayload,
  integrationId?: string,
) {
  const { issue } = payload;
  const items = payload.changelog?.items ?? [];

  if (items.length === 0) {
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

  for (const integration of integrations) {
    try {
      const externalLink = await findExternalLink(
        integration.id,
        "issue",
        issue.key,
      );

      if (!externalLink) {
        continue;
      }

      const config = JSON.parse(integration.config) as JiraConfig;
      const client = createJiraClient(config);

      const { title: titleChanged, description: descriptionChanged } =
        textChanged(items);
      const statusItem = items.find((item) => item.field === "status");
      const labelsChanged = items.some((item) => item.field === "labels");

      if (titleChanged || descriptionChanged) {
        await withEchoConfirmation(
          async () => await client.getIssue(issue.key),
          (current, confirmation) =>
            withIntegrationLink(
              externalLink,
              integration,
              async (db, afterCommit) => {
                const task = await db.query.taskTable.findFirst({
                  where: linkedTaskScope(
                    externalLink.taskId,
                    integration.projectId,
                  ),
                });

                if (!task) {
                  return;
                }
                const metadata = externalLink.metadata
                  ? JSON.parse(externalLink.metadata)
                  : {};

                const updateData: Record<string, unknown> = {};
                const updatedMetadata = { ...metadata };

                if (!updatedMetadata.lastSync) {
                  updatedMetadata.lastSync = {};
                }

                if (titleChanged) {
                  if (
                    !metadata.lastSync?.title ||
                    !inboundEcho(
                      metadata.lastSync.title,
                      issue.fields.summary,
                      issue.fields.updated,
                      current?.fields.summary,
                      {
                        linkId: externalLink.id,
                        field: "title",
                        localValue: task.title,
                        confirmation,
                      },
                    )
                  ) {
                    updateData.title = issue.fields.summary;
                    updatedMetadata.lastSync.title = inboundStamp(
                      metadata.lastSync?.title,
                      issue.fields.summary,
                      "jira",
                      issue.fields.updated,
                    );
                  }
                }

                if (descriptionChanged) {
                  const formatted = formatTaskDescriptionFromJira(
                    issue.fields.description,
                    externalLink.taskId,
                  );
                  if (
                    !metadata.lastSync?.description ||
                    !inboundEcho(
                      metadata.lastSync.description,
                      formatted,
                      issue.fields.updated,
                      current
                        ? formatTaskDescriptionFromJira(
                            current.fields.description,
                            task.id,
                          )
                        : undefined,
                      {
                        linkId: externalLink.id,
                        field: "description",
                        localValue: task.description || "",
                        confirmation,
                      },
                    )
                  ) {
                    updateData.description = formatted;
                    updatedMetadata.lastSync.description = inboundStamp(
                      metadata.lastSync?.description,
                      formatted,
                      "jira",
                      issue.fields.updated,
                    );
                  }
                }

                if (Object.keys(updateData).length > 0) {
                  await db
                    .update(taskTable)
                    .set(updateData)
                    .where(linkedTaskScope(task.id, integration.projectId));

                  await updateExternalLink(
                    externalLink.id,
                    {
                      title: issue.fields.summary,
                      metadata: updatedMetadata,
                    },
                    db,
                  );
                  afterCommit(() =>
                    publishEvent("task.updated", {
                      projectId: integration.projectId,
                      taskId: externalLink.taskId,
                      ...(typeof updateData.title === "string"
                        ? { titleChanged: true }
                        : {}),
                    }),
                  );
                }
              },
              {
                validate: (binding) =>
                  issueEditScope(binding) === issueEditScope(integration),
              },
            ),
          () =>
            deferIssueEdit(externalLink, integration, [
              ...(titleChanged ? ["title" as const] : []),
              ...(descriptionChanged ? ["description" as const] : []),
            ]),
        );
      }

      if (statusItem) {
        await withIntegrationLink(
          externalLink,
          integration,
          async (db, afterCommit) => {
            const task = await db.query.taskTable.findFirst({
              where: linkedTaskScope(
                externalLink.taskId,
                integration.projectId,
              ),
            });

            if (!task) {
              return;
            }

            const existingMetadata: Record<string, unknown> & {
              lastSync?: { state?: SyncStamp };
            } = externalLink.metadata
              ? JSON.parse(externalLink.metadata)
              : {};

            const closed =
              issue.fields.status?.statusCategory?.key === "done";
            const incomingState = closed ? "closed" : "open";

            // Skip when this delivery echoes our own outbound transition.
            if (
              existingMetadata.lastSync?.state &&
              inboundEcho(
                existingMetadata.lastSync.state,
                incomingState,
                issue.fields.updated,
                incomingState,
                {
                  linkId: externalLink.id,
                  field: "state",
                  localValue: (await isTaskInFinalState(task, db))
                    ? "closed"
                    : "open",
                },
              )
            )
              return;
            const lastOutbound = existingMetadata.lastOutboundStateSyncAt;
            if (
              typeof lastOutbound === "number" &&
              Number.isFinite(lastOutbound) &&
              existingMetadata.state === incomingState
            ) {
              const eventMs = parseIssueUpdatedAtMs(issue);
              if (
                eventMs !== null &&
                Math.abs(eventMs - lastOutbound) <=
                  OUTBOUND_STATE_ECHO_WINDOW_MS
              ) {
                return;
              }
            }

            const targetStatus = await resolveTargetStatus(
              task.projectId,
              closed ? "issue_closed" : "issue_reopened",
              closed ? "done" : "to-do",
              db,
              integration.id,
              issue.fields.status?.name,
            );

            const statusResult = await updateTaskStatus(
              task.id,
              targetStatus,
              db,
            );
            if (
              statusResult.applied &&
              statusResult.before.status !== statusResult.after.status
            ) {
              afterCommit(() =>
                publishEvent("task.status_changed", {
                  taskId: statusResult.after.id,
                  projectId: statusResult.after.projectId,
                  userId: null,
                  oldStatus: statusResult.before.status,
                  newStatus: statusResult.after.status,
                  title: statusResult.after.title,
                  assigneeId: statusResult.after.userId,
                  type: "status_changed",
                }),
              );
            }

            await updateExternalLink(
              externalLink.id,
              {
                metadata: {
                  ...existingMetadata,
                  state: incomingState,
                  lastSync: {
                    ...existingMetadata.lastSync,
                    state: inboundStamp(
                      existingMetadata.lastSync?.state,
                      incomingState,
                      "jira",
                      issue.fields.updated,
                    ),
                  },
                },
              },
              db,
            );
          },
          {
            validate: (binding) =>
              issueEditScope(binding) === issueEditScope(integration),
          },
        );
      }

      if (labelsChanged) {
        await withIntegrationLink(
          externalLink,
          integration,
          async (db, afterCommit) => {
            await syncJiraLabelsToTask(
              externalLink.taskId,
              integration.project.workspaceId,
              issue.fields.labels,
              db,
            );
            afterCommit(() =>
              publishEvent("task.labels_updated", {
                projectId: integration.projectId,
                taskId: externalLink.taskId,
              }),
            );
          },
        );
      }
    } catch (error) {
      if (error instanceof PendingResponseTimeout) throw error;
      console.error("Jira issue_updated handler failed for integration", {
        integrationId: integration.id,
        issueKey: issue.key,
        error,
      });
    }
  }
}
