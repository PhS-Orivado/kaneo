import { eq } from "drizzle-orm";
import db from "../../database";
import { integrationTable } from "../../database/schema";
import type { JiraConfig } from "./config";
import { safeSecretEqual, verifyJiraSignature } from "./utils/verify-signature";
import { handleJiraIssueCommentCreated } from "./webhooks/issue-comment-created";
import { handleJiraIssueCreated } from "./webhooks/issue-created";
import { handleJiraIssueUpdated } from "./webhooks/issue-updated";

type CommentPayload = Parameters<typeof handleJiraIssueCommentCreated>[0];
type CreatedPayload = Parameters<typeof handleJiraIssueCreated>[0];
type UpdatedPayload = Parameters<typeof handleJiraIssueUpdated>[0];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isCreatedPayload(
  payload: Record<string, unknown>,
): payload is CreatedPayload {
  return (
    isRecord(payload.issue) &&
    isRecord((payload.issue as Record<string, unknown>).fields)
  );
}

function isUpdatedPayload(
  payload: Record<string, unknown>,
): payload is UpdatedPayload {
  return (
    isRecord(payload.issue) &&
    isRecord((payload.issue as Record<string, unknown>).fields)
  );
}

function isCommentPayload(
  payload: Record<string, unknown>,
): payload is CommentPayload {
  return isRecord(payload.issue) && isRecord(payload.comment);
}

export async function handleJiraWebhookRequest(
  integrationId: string,
  rawBody: string,
  signatureHeader: string | undefined,
  secretHeader: string | undefined,
): Promise<{ success: boolean; error?: string }> {
  const integration = await db.query.integrationTable.findFirst({
    where: eq(integrationTable.id, integrationId),
  });

  if (integration?.type !== "jira") {
    return { success: false, error: "Jira integration not found" };
  }

  let config: JiraConfig;
  try {
    config = JSON.parse(integration.config) as JiraConfig;
  } catch {
    return { success: false, error: "Invalid integration config" };
  }

  const secret = config.webhookSecret;
  if (secret) {
    // Jira does not sign webhook deliveries itself; automation rules can.
    // Accept either a HMAC-SHA256 signature header or a literal secret header.
    const signed =
      verifyJiraSignature(rawBody, secret, signatureHeader) ||
      safeSecretEqual(secretHeader, secret);
    if (!signed) {
      return { success: false, error: "Invalid webhook signature" };
    }
  } else {
    console.warn("[Jira Webhook] Delivered without a configured secret", {
      integrationId,
    });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return { success: false, error: "Invalid JSON payload" };
  }

  const event =
    typeof payload.webhookEvent === "string"
      ? payload.webhookEvent
      : typeof payload.webhookEventName === "string"
        ? (payload.webhookEventName as string)
        : "";

  try {
    await dispatchJiraEvent(event, payload, integration.id);
    return { success: true };
  } catch (error) {
    console.error("[Jira Webhook] Handler error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Webhook handler failed",
    };
  }
}

async function dispatchJiraEvent(
  event: string,
  payload: Record<string, unknown>,
  integrationId: string,
) {
  console.log(`[Jira Webhook] Event: ${event}`);

  switch (event) {
    case "jira:issue_created": {
      if (isCreatedPayload(payload)) {
        await handleJiraIssueCreated(payload, integrationId);
      }
      return;
    }
    case "jira:issue_updated": {
      // Comment webhooks may arrive as comment_created or as an issue update
      // carrying the comment in the payload.
      if (isCommentPayload(payload) && payload.comment) {
        await handleJiraIssueCommentCreated(
          payload as unknown as CommentPayload,
          integrationId,
        );
        return;
      }
      if (isUpdatedPayload(payload)) {
        await handleJiraIssueUpdated(payload, integrationId);
      }
      return;
    }
    case "comment_created":
    case "comment_updated": {
      if (isCommentPayload(payload)) {
        await handleJiraIssueCommentCreated(payload, integrationId);
      }
      return;
    }
    default:
      console.log(`[Jira Webhook] Ignored event: ${event}`);
  }
}
