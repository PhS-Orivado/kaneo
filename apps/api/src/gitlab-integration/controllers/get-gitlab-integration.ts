import { and, eq } from "drizzle-orm";
import db from "../../database";
import { integrationTable } from "../../database/schema";
import {
  defaultGitlabConfig,
  type GitlabConfig,
} from "../../plugins/gitlab/config";
import { tokenTypeOf } from "../../plugins/gitlab/utils/gitlab-api";
import { normalizeApiServerUrl } from "../../utils/openapi-spec";

type IntegrationRow = typeof integrationTable.$inferSelect;

function maskToken(token: string): string {
  if (token.length <= 8) {
    return "••••••••";
  }
  return `${token.slice(0, 4)}••••••${token.slice(-4)}`;
}

function gitlabWebhookUrl(integrationId: string): string {
  const apiBase = normalizeApiServerUrl(
    process.env.KANEO_API_URL || "http://localhost:1337",
  );
  return `${apiBase.replace(/\/$/, "")}/gitlab-integration/webhook/${integrationId}`;
}

// RFC 0001 WP4: the GitLab surface is keyed by integration id; the identity
// columns written at create time are authoritative, with the config JSON as
// a fallback for legacy rows. The webhook secret goes only to callers with
// workspace:manage_settings, and it is per row, so each project owner sees
// only their own binding's secret.
function enrichGitlabIntegration(
  integration: IntegrationRow,
  includeWebhookSecret: boolean,
) {
  let config: GitlabConfig;
  try {
    config = JSON.parse(integration.config) as GitlabConfig;
  } catch {
    config = {
      baseUrl: "",
      accessToken: "",
      projectPath: "",
    } as GitlabConfig;
  }

  return {
    id: integration.id,
    projectId: integration.projectId,
    baseUrl: integration.baseUrl ?? config.baseUrl,
    projectPath: config.projectPath ?? "",
    tokenType: tokenTypeOf(config),
    maskedAccessToken: maskToken(config.accessToken ?? ""),
    webhookUrl: gitlabWebhookUrl(integration.id),
    webhookSecret: includeWebhookSecret ? (config.webhookSecret ?? "") : "",
    branchPattern: config.branchPattern || defaultGitlabConfig.branchPattern,
    commentTaskLinkOnGitlabIssue: config.commentTaskLinkOnGitlabIssue !== false,
    isActive: integration.isActive,
    createdAt: integration.createdAt,
    updatedAt: integration.updatedAt,
  };
}

/** List every GitLab binding of a project, oldest first. */
async function listGitlabIntegrations(
  projectId: string,
  includeWebhookSecret = false,
) {
  const integrations = await db.query.integrationTable.findMany({
    where: and(
      eq(integrationTable.projectId, projectId),
      eq(integrationTable.type, "gitlab"),
    ),
    orderBy: (table, { asc }) => [asc(table.createdAt)],
  });
  return integrations.map((integration) =>
    enrichGitlabIntegration(integration, includeWebhookSecret),
  );
}

/** Single lookup by primary key (id-keyed routes). */
async function getGitlabIntegrationById(
  integrationId: string,
  includeWebhookSecret = false,
) {
  const integration = await db.query.integrationTable.findFirst({
    where: eq(integrationTable.id, integrationId),
  });
  if (!integration) {
    return null;
  }
  return enrichGitlabIntegration(integration, includeWebhookSecret);
}

/**
 * Compat shim (RFC section 8): the old project-keyed GET returns the first
 * binding (lowest createdAt) until the new web client ships; removed in the
 * cleanup PR.
 */
async function getGitlabIntegration(
  projectId: string,
  includeWebhookSecret = false,
) {
  const integration = await db.query.integrationTable.findFirst({
    where: and(
      eq(integrationTable.projectId, projectId),
      eq(integrationTable.type, "gitlab"),
    ),
    orderBy: (table, { asc }) => [asc(table.createdAt)],
  });
  if (!integration) {
    return null;
  }
  return enrichGitlabIntegration(integration, includeWebhookSecret);
}

export default getGitlabIntegration;
export {
  getGitlabIntegration,
  getGitlabIntegrationById,
  listGitlabIntegrations,
};
