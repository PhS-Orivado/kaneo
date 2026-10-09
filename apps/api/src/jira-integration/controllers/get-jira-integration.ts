import { and, eq } from "drizzle-orm";
import db from "../../database";
import { integrationTable } from "../../database/schema";
import { type JiraConfig } from "../../plugins/jira/config";
import { normalizeApiServerUrl } from "../../utils/openapi-spec";

type IntegrationRow = typeof integrationTable.$inferSelect;

function maskToken(token: string): string {
  if (token.length <= 8) {
    return "••••••••";
  }
  return `${token.slice(0, 4)}••••••${token.slice(-4)}`;
}

function jiraWebhookUrl(integrationId: string): string {
  const apiBase = normalizeApiServerUrl(
    process.env.KANEO_API_URL || "http://localhost:1337",
  );
  return `${apiBase.replace(/\/$/, "")}/jira-integration/webhook/${integrationId}`;
}

// The identity columns written at create time are authoritative, with the
// config JSON as a fallback for legacy rows. The webhook secret goes only to
// callers with workspace:manage_settings, and it is per row, so each project
// owner sees only their own binding's secret.
function enrichJiraIntegration(
  integration: IntegrationRow,
  includeWebhookSecret: boolean,
) {
  let config: JiraConfig;
  try {
    config = JSON.parse(integration.config) as JiraConfig;
  } catch {
    config = {
      baseUrl: "",
      authMode: "cloud",
      apiToken: "",
      projectKey: "",
    } as JiraConfig;
  }

  return {
    id: integration.id,
    projectId: integration.projectId,
    baseUrl: config.baseUrl,
    authMode: config.authMode,
    email: config.email,
    projectKey: config.projectKey,
    maskedApiToken: maskToken(config.apiToken),
    webhookUrl: jiraWebhookUrl(integration.id),
    webhookSecret: includeWebhookSecret ? (config.webhookSecret ?? "") : "",
    issueType: config.issueType,
    statusMap: config.statusMap,
    commentTaskLinkOnJiraIssue: config.commentTaskLinkOnJiraIssue !== false,
    isActive: integration.isActive,
    createdAt: integration.createdAt,
    updatedAt: integration.updatedAt,
  };
}

/** List every Jira binding of a project, oldest first. */
async function listJiraIntegrations(
  projectId: string,
  includeWebhookSecret = false,
) {
  const integrations = await db.query.integrationTable.findMany({
    where: and(
      eq(integrationTable.projectId, projectId),
      eq(integrationTable.type, "jira"),
    ),
    orderBy: (table, { asc }) => [asc(table.createdAt)],
  });
  return integrations.map((integration) =>
    enrichJiraIntegration(integration, includeWebhookSecret),
  );
}

/** Single lookup by primary key (id-keyed routes). */
async function getJiraIntegrationById(
  integrationId: string,
  includeWebhookSecret = false,
) {
  const integration = await db.query.integrationTable.findFirst({
    where: eq(integrationTable.id, integrationId),
  });
  if (!integration) {
    return null;
  }
  return enrichJiraIntegration(integration, includeWebhookSecret);
}

/**
 * Compat shim: the old project-keyed GET returns the first binding (lowest
 * createdAt) until the new web client ships.
 */
async function getJiraIntegration(
  projectId: string,
  includeWebhookSecret = false,
) {
  const integration = await db.query.integrationTable.findFirst({
    where: and(
      eq(integrationTable.projectId, projectId),
      eq(integrationTable.type, "jira"),
    ),
    orderBy: (table, { asc }) => [asc(table.createdAt)],
  });
  if (!integration) {
    return null;
  }
  return enrichJiraIntegration(integration, includeWebhookSecret);
}

export default getJiraIntegration;
export { getJiraIntegration, getJiraIntegrationById, listJiraIntegrations };
