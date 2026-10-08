import {
  initializeTaskIssue,
  isIssueInitializationPending,
} from "../../sync/initialize-task-issue";
import { canSyncTask } from "../../sync/eligibility";
import { withTaskSyncCreation } from "../../sync/create-task-issue";
import { syncTaskFieldLabels } from "../../sync/sync-task-field-labels";
import {
  createExternalLink,
  updateExternalLink,
  findExternalLinkByTaskAndType,
} from "../../github/services/link-manager";
import type { PluginContext, TaskCreatedEvent } from "../../types";
import type { JiraConfig } from "../config";
import { createJiraClient } from "../utils/jira-api";
import { formatJiraDescription, jiraIssueBrowseUrl } from "../utils/format";
import { jiraPriorityNameForTask } from "../utils/priority";
import {
  findTransitionByName,
  findTransitionToStatusCategory,
} from "../utils/transitions";
import { addLabelsToIssueJira, removeLabelJira } from "../utils/labels";

async function createTaskIssue(
  event: TaskCreatedEvent,
  context: PluginContext,
): Promise<void> {
  const config = context.config as JiraConfig;
  if (!config.baseUrl || !config.apiToken) {
    return;
  }

  const existingLink = await findExternalLinkByTaskAndType(
    event.taskId,
    context.integrationId,
    "issue",
  );

  if (existingLink && !isIssueInitializationPending(existingLink)) return;

  try {
    const client = createJiraClient(config);
    if (
      !(await canSyncTask(
        event.taskId,
        context.integrationId,
        undefined,
        JSON.stringify(context.config),
      ))
    )
      return;

    let createdLink: { id: string; metadata?: string | null } | undefined =
      existingLink;
    let issueKey = existingLink ? existingLink.externalId : "";
    if (!existingLink) {
      const createdIssue = await client.createIssue({
        project: { key: config.projectKey },
        summary: event.title,
        description: formatJiraDescription(event.description, event.taskId),
        issuetype: { name: config.issueType ?? "Task" },
        priority: { name: jiraPriorityNameForTask(event.priority) },
      });

      createdLink = await createExternalLink({
        taskId: event.taskId,
        integrationId: context.integrationId,
        resourceType: "issue",
        externalId: createdIssue.key,
        url: jiraIssueBrowseUrl(config.baseUrl, createdIssue.key),
        title: event.title,
        metadata: {
          state: "open",
          createdFrom: "kaneo",
          syncInitializationPending: true,
          syncCreatedText: {
            title: event.title,
            description: event.description ?? "",
          },
          lastOutboundStateSyncAt: Date.now(),
        },
      });
      issueKey = createdIssue.key;
    }
    if (!createdLink) return;

    if (
      !(await canSyncTask(
        event.taskId,
        context.integrationId,
        undefined,
        JSON.stringify(context.config),
      ))
    ) {
      await updateExternalLink(createdLink.id, {
        metadata: { syncFilterPaused: true },
      });
      return;
    }

    await initializeTaskIssue(event, context, createdLink, {
      text: async (field, value) => {
        await client.editIssue(
          issueKey,
          field === "title"
            ? { summary: value }
            : { description: formatJiraDescription(value, event.taskId) },
        );
        return (await client.getIssue(issueKey, "updated")).fields.updated;
      },
      state: async (value) => {
        const { transitions } = await client.getTransitions(issueKey);
        const mappedStatus = config.statusMap?.[event.status];
        const transition =
          (mappedStatus
            ? findTransitionByName(transitions, mappedStatus)
            : undefined) ??
          findTransitionToStatusCategory(
            transitions,
            value === "closed" ? "done" : "indeterminate",
          ) ??
          findTransitionToStatusCategory(
            transitions,
            value === "closed" ? "done" : "new",
          );
        if (!transition) return undefined;
        await client.doTransition(issueKey, transition.id);
        return (await client.getIssue(issueKey, "updated")).fields.updated;
      },
      labels: () =>
        syncTaskFieldLabels(
          event.taskId,
          context,
          { id: createdLink.id, externalId: issueKey },
          "jira",
          "initialization",
          async ({ add, remove }, write) => {
            for (const name of remove)
              await removeLabelJira(config, issueKey, name, write, true);
            await addLabelsToIssueJira(config, issueKey, add, true, write);
          },
        ),
    });
  } catch (error) {
    console.error("Failed to create Jira issue:", error);
  }
}

export async function handleTaskCreated(
  event: TaskCreatedEvent,
  context: PluginContext,
): Promise<void> {
  await withTaskSyncCreation(event, context, (current) =>
    createTaskIssue(current, context),
  );
}
