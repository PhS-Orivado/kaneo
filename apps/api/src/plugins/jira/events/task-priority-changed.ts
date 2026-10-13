import { syncTaskFieldLabels } from "../../sync/sync-task-field-labels";
import { canSyncTask } from "../../sync/eligibility";
import { findExternalLinksByTask } from "../../github/services/link-manager";
import type { PluginContext, TaskPriorityChangedEvent } from "../../types";
import type { JiraConfig } from "../config";
import { addLabelsToIssueJira, removeLabelJira } from "../utils/labels";

export async function handleTaskPriorityChanged(
  event: TaskPriorityChangedEvent,
  context: PluginContext,
): Promise<void> {
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
    const links = await findExternalLinksByTask(event.taskId);
    const issueLink = links.find(
      (link) =>
        link.integrationId === context.integrationId &&
        link.resourceType === "issue",
    );

    if (!issueLink) {
      return;
    }
    const issueKey = issueLink.externalId;

    await syncTaskFieldLabels(
      event.taskId,
      context,
      issueLink,
      "jira",
      "priority",
      async ({ add, remove }, write) => {
        for (const name of remove)
          await removeLabelJira(config, issueKey, name, write, true);
        if (add.length)
          await addLabelsToIssueJira(config, issueKey, add, true, write);
      },
    );
  } catch (error) {
    console.error("Failed to update Jira issue priority:", error);
  }
}
