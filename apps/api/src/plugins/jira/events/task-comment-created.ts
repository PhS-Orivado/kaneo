import { dispatchIssueWrite } from "../../sync/dispatch-issue-write";
import { canSyncTask } from "../../sync/eligibility";
import { findExternalLinkByTaskAndType } from "../../github/services/link-manager";
import type { PluginContext, TaskCommentCreatedEvent } from "../../types";
import type { JiraConfig } from "../config";
import { markKaneoComment } from "../utils/comment-origin";
import { createJiraClient } from "../utils/jira-api";

export async function handleTaskCommentCreated(
  event: TaskCommentCreatedEvent,
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

  const existingLink = await findExternalLinkByTaskAndType(
    event.taskId,
    context.integrationId,
    "issue",
  );

  if (!existingLink) {
    return;
  }

  try {
    const client = createJiraClient(config);
    const issueKey = existingLink.externalId;

    await dispatchIssueWrite(existingLink, JSON.stringify(context.config), () =>
      client.addComment(issueKey, markKaneoComment(event.comment)),
    );
  } catch (error) {
    console.error("Failed to create Jira comment:", error);
  }
}
