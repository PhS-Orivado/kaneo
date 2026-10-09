import { canSyncTask } from "../../sync/eligibility";
import { syncLatestTaskValue } from "../../github/services/sync-latest-task-value";
import db from "../../../database";
import { linkedTaskScope } from "../../github/services/integration-task-scope";
import { findExternalLinksByTask } from "../../github/services/link-manager";
import type { PluginContext, TaskDescriptionChangedEvent } from "../../types";
import type { JiraConfig } from "../config";
import { createJiraClient } from "../utils/jira-api";
import {
  formatJiraDescription,
  formatTaskDescriptionFromJira,
} from "../utils/format";

type LinkSyncState = import("../../github/utils/sync-echo").SyncStamp;

type LinkMetadata = {
  lastSync?: {
    description?: LinkSyncState;
  };
  [key: string]: unknown;
};

export async function handleTaskDescriptionChanged(
  event: TaskDescriptionChangedEvent,
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
      columns: { description: true },
    });
    if (
      !current ||
      (current.description || "") !== (event.newDescription || "")
    )
      return;

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
          "Failed to parse Jira issue link metadata for description sync",
          {
            issueLinkId: issueLink.id,
            taskId: issueLink.taskId,
            metadata: issueLink.metadata,
            error,
          },
        );
      }
    }

    const lastDescSync = metadata.lastSync?.description;
    const newDescNormalized = event.newDescription || "";

    if (lastDescSync) {
      if (
        lastDescSync.value === newDescNormalized &&
        lastDescSync.source === "jira"
      ) {
        console.log("Skipping description sync - already synced from Jira");
        return;
      }
    }

    const client = createJiraClient(config);
    const issueKey = issueLink.externalId;

    await syncLatestTaskValue(
      event.taskId,
      context.projectId,
      issueLink,
      "description",
      newDescNormalized,
      async (value) => {
        await client.editIssue(issueKey, {
          description: formatJiraDescription(value, event.taskId),
        });
        return (await client.getIssue(issueKey, "updated")).fields.updated;
      },
      async () =>
        formatTaskDescriptionFromJira(
          (await client.getIssue(issueKey)).fields.description ?? null,
          event.taskId,
        ),
      { type: "jira", config: JSON.stringify(config) },
    );

    console.log(`Synced task description to Jira issue ${issueKey}`);
  } catch (error) {
    console.error("Failed to update Jira issue description:", error);
  }
}
