import { canSyncTask } from "../../sync/eligibility";
import { syncLatestTaskValue } from "../../github/services/sync-latest-task-value";
import db from "../../../database";
import { linkedTaskScope } from "../../github/services/integration-task-scope";
import { findExternalLinksByTask } from "../../github/services/link-manager";
import type { PluginContext, TaskTitleChangedEvent } from "../../types";
import type { JiraConfig } from "../config";
import { createJiraClient } from "../utils/jira-api";

type LinkSyncState = import("../../github/utils/sync-echo").SyncStamp;

type LinkMetadata = {
  lastSync?: {
    title?: LinkSyncState;
  };
  [key: string]: unknown;
};

export async function handleTaskTitleChanged(
  event: TaskTitleChangedEvent,
  context: PluginContext,
): Promise<void> {
  if (event.sourceIntegrationId === context.integrationId) return;

  if (
    !(await canSyncTask(
      event.taskId,
      context.integrationId,
      undefined,
      JSON.stringify(context.config),
    ))
  )
    return;

  const config = context.config as JiraConfig;
  if (!config.baseUrl || !config.apiToken) {
    return;
  }

  try {
    const current = await db.query.taskTable.findFirst({
      where: linkedTaskScope(event.taskId, context.projectId),
      columns: { title: true },
    });
    if (!current || current.title !== event.newTitle) return;

    const links = await findExternalLinksByTask(event.taskId);
    const issueLink = links.find(
      (link) =>
        link.integrationId === context.integrationId &&
        link.resourceType === "issue",
    );

    if (!issueLink) {
      return;
    }

    let metadata: LinkMetadata = {};
    if (issueLink.metadata) {
      try {
        metadata = JSON.parse(issueLink.metadata) as LinkMetadata;
      } catch (error) {
        console.warn(
          "Failed to parse Jira issue link metadata for title sync",
          {
            issueLinkId: issueLink.id,
            taskId: issueLink.taskId,
            metadata: issueLink.metadata,
            error,
          },
        );
      }
    }

    const lastTitleSync = metadata.lastSync?.title;
    if (lastTitleSync) {
      if (
        lastTitleSync.value === event.newTitle &&
        lastTitleSync.source === "jira"
      ) {
        console.log("Skipping title sync - already synced from Jira");
        return;
      }
    }

    const client = createJiraClient(config);
    const issueKey = issueLink.externalId;

    await syncLatestTaskValue(
      event.taskId,
      context.projectId,
      issueLink,
      "title",
      event.newTitle,
      async (value) => {
        await client.editIssue(issueKey, { summary: value });
        return (await client.getIssue(issueKey, "updated")).fields.updated;
      },
      async () => (await client.getIssue(issueKey)).fields.summary,
      { type: "jira", config: JSON.stringify(config) },
    );

    console.log(`Synced task title to Jira issue ${issueKey}`);
  } catch (error) {
    console.error("Failed to update Jira issue title:", error);
  }
}
