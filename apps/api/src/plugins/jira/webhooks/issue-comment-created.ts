import { withIntegrationLink } from "../../github/services/with-integration-link";
import { activityTable } from "../../../database/schema";
import { findExternalLink } from "../../github/services/link-manager";
import {
  baseUrlFromIssueSelf,
  findAllIntegrationsByJiraProject,
  projectKeyFromIssueKey,
} from "../services/integration-lookup";
import type { JiraConfig } from "../config";
import { bodyFromKaneoComment, isKaneoComment } from "../utils/comment-origin";
import { jiraCommentUrl } from "../utils/format";
import type { JiraUser } from "../utils/jira-api";

type CommentWebhookPayload = {
  webhookEvent?: string;
  issue: {
    id: string;
    key: string;
    self: string;
    fields?: { project?: { key?: string } | null } | null;
  };
  comment: {
    id: string;
    self: string;
    body: string;
    created?: string;
    updated?: string;
    author?: JiraUser | null;
  };
};

export async function handleJiraIssueCommentCreated(
  payload: CommentWebhookPayload,
  integrationId?: string,
) {
  const { issue, comment } = payload;

  // Comments authored by Kaneo's own token, by Atlassian apps, or carrying
  // the Kaneo marker are outbound echoes, not user activity.
  if (isKaneoComment(comment.body)) {
    return;
  }
  if (
    comment.author?.accountType === "app" ||
    (comment.author?.accountId && comment.author.accountId === "app")
  ) {
    return;
  }

  const baseUrl = baseUrlFromIssueSelf(issue.self);
  if (!baseUrl) return;

  const projectKey =
    issue.fields?.project?.key ?? projectKeyFromIssueKey(issue.key);
  const integrations = await findAllIntegrationsByJiraProject(
    baseUrl,
    projectKey,
    integrationId,
  );

  for (const integration of integrations) {
    let config: JiraConfig;
    try {
      config = JSON.parse(integration.config) as JiraConfig;
    } catch {
      continue;
    }

    if (
      config.selfAccountId &&
      comment.author?.accountId &&
      comment.author.accountId === config.selfAccountId
    ) {
      continue;
    }

    const existingLink = await findExternalLink(
      integration.id,
      "issue",
      issue.key,
    );

    if (!existingLink) {
      continue;
    }

    const author = comment.author;
    const username = author?.displayName ?? author?.name ?? "Unknown";

    await withIntegrationLink(existingLink, integration, async (db) => {
      await db
        .insert(activityTable)
        .values({
          taskId: existingLink.taskId,
          type: "comment",
          content: bodyFromKaneoComment(comment.body),
          externalUserName: username,
          externalSource: "jira",
          externalUrl: jiraCommentUrl(config.baseUrl, issue.key, comment.id),
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
    });
  }
}
