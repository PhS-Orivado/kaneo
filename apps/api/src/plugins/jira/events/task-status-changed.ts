import { createIssueWrite } from "../../sync/dispatch-issue-write";
import { syncTaskFieldLabels } from "../../sync/sync-task-field-labels";
import { canSyncTask } from "../../sync/eligibility";
import { isTaskInFinalState } from "../../github/services/task-service";
import {
  findExternalLinksByTask,
  updateExternalLink,
} from "../../github/services/link-manager";
import { parseLinkMetadata } from "../../github/utils/parse-link-metadata";
import type { PluginContext, TaskStatusChangedEvent } from "../../types";
import type { JiraConfig } from "../config";
import { createJiraClient } from "../utils/jira-api";
import {
  findTransitionByName,
  findTransitionToStatusCategory,
} from "../utils/transitions";
import { addLabelsToIssueJira, removeLabelJira } from "../utils/labels";

export async function handleTaskStatusChanged(
  event: TaskStatusChangedEvent,
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
    const links = await findExternalLinksByTask(event.taskId);
    const issueLink = links.find(
      (link) =>
        link.integrationId === context.integrationId &&
        link.resourceType === "issue",
    );

    if (!issueLink) {
      return;
    }
    const client = createJiraClient(config);
    const issueKey = issueLink.externalId;

    const currentValue = await syncTaskFieldLabels(
      event.taskId,
      context,
      issueLink,
      "jira",
      "status",
      async ({ add, remove }, write) => {
        for (const name of remove)
          await removeLabelJira(config, issueKey, name, write, true);
        if (add.length)
          await addLabelsToIssueJira(config, issueKey, add, true, write);
      },
    );
    if (currentValue === undefined) return;
    const write = createIssueWrite(
      { ...issueLink, taskId: event.taskId },
      JSON.stringify(context.config),
    );

    const closing = await isTaskInFinalState({
      projectId: event.projectId,
      status: currentValue,
      columnId: null,
    });
    const reopening =
      !closing &&
      (await isTaskInFinalState({
        projectId: event.projectId,
        status: event.oldStatus,
        columnId: null,
      }));

    if (!closing && !reopening) {
      return;
    }

    const { transitions } = await client.getTransitions(issueKey);
    const mappedStatus = config.statusMap?.[currentValue];
    const transition =
      (mappedStatus
        ? findTransitionByName(transitions, mappedStatus)
        : undefined) ??
    (closing
      ? findTransitionToStatusCategory(transitions, "done")
      : (findTransitionToStatusCategory(transitions, "indeterminate") ??
        findTransitionToStatusCategory(transitions, "new")));

    if (!transition) {
      console.warn("No Jira transition available for status sync", {
        integrationId: context.integrationId,
        issueKey,
        closing,
        mappedStatus,
      });
      return;
    }

    await write(() => client.doTransition(issueKey, transition.id));

    await updateExternalLink(issueLink.id, {
      metadata: {
        ...parseLinkMetadata(issueLink.metadata, {
          externalLinkId: issueLink.id,
          source: "task_status_changed",
        }),
        state: closing ? "closed" : "open",
        lastOutboundStateSyncAt: Date.now(),
      },
    });
  } catch (error) {
    console.error("Failed to update Jira issue status:", error);
  }
}
