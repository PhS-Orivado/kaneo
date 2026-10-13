import { and, eq } from "drizzle-orm";
import db from "../../../database";
import { integrationTable } from "../../../database/schema";
import type { JiraConfig } from "../config";
import { normalizeJiraBaseUrl } from "../config";

// Jira self links look like <baseUrl>/rest/api/2/issue/<id>; the instance root
// is everything before the /rest/ segment.
export function baseUrlFromIssueSelf(self: string): string | null {
  try {
    const parsed = new URL(self);
    const match = parsed.pathname.match(/^(\/.*)\/rest\/api/);
    const path = match?.[1] ?? "";
    return `${parsed.origin}${path.replace(/\/+$/, "")}`;
  } catch {
    return null;
  }
}

export function projectKeyFromIssueKey(issueKey: string): string {
  const index = issueKey.lastIndexOf("-");
  return index > 0 ? issueKey.slice(0, index) : issueKey;
}

export async function findAllIntegrationsByJiraProject(
  baseUrl: string,
  projectKey: string,
  integrationId?: string,
) {
  const normalized = normalizeJiraBaseUrl(baseUrl);
  const conditions = [
    eq(integrationTable.type, "jira"),
    eq(integrationTable.isActive, true),
  ];
  if (integrationId) {
    conditions.push(eq(integrationTable.id, integrationId));
  }

  const integrations = await db.query.integrationTable.findMany({
    where: and(...conditions),
    with: {
      project: true,
    },
  });

  return integrations.filter((integration) => {
    try {
      const config = JSON.parse(integration.config) as JiraConfig;
      const matches =
        normalizeJiraBaseUrl(config.baseUrl) === normalized &&
        config.projectKey.toLowerCase() === projectKey.toLowerCase();
      if (integrationId && !matches) {
        console.warn("[Jira Webhook] Signed integration project mismatch", {
          integrationId,
        });
      }
      return matches;
    } catch {
      return false;
    }
  });
}
