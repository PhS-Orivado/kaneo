import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { integrationTable } from "../../database/schema";
import { normalizeJiraBaseUrl } from "../../plugins/jira/config";

type SavedJiraConfig = {
  baseUrl?: unknown;
  authMode?: unknown;
  email?: unknown;
  apiToken?: unknown;
};

export async function resolveVerificationToken(input: {
  projectId: string;
  baseUrl: string;
  authMode: "cloud" | "dc";
  email?: string;
  apiToken?: string;
}) {
  let baseUrl: string;
  try {
    baseUrl = normalizeJiraBaseUrl(input.baseUrl);
  } catch {
    throw new HTTPException(400, {
      message:
        "Enter a valid HTTP or HTTPS Jira URL without credentials, a query, or a fragment.",
    });
  }
  if (input.apiToken?.trim()) return input.apiToken.trim();
  const integration = await db.query.integrationTable.findFirst({
    where: and(
      eq(integrationTable.projectId, input.projectId),
      eq(integrationTable.type, "jira"),
    ),
  });
  let config: SavedJiraConfig | null = null;
  try {
    config = integration ? JSON.parse(integration.config) : null;
  } catch {
    throw new HTTPException(400, {
      message: "Invalid saved Jira configuration. Reconnect the integration.",
    });
  }
  let savedBaseUrl: string | undefined;
  if (typeof config?.baseUrl === "string") {
    try {
      savedBaseUrl = normalizeJiraBaseUrl(config.baseUrl);
    } catch {
      throw new HTTPException(400, {
        message: "Invalid saved Jira configuration. Reconnect the integration.",
      });
    }
  }
  // Never forward a stored credential to an edited destination.
  if (
    typeof config?.apiToken !== "string" ||
    !config.apiToken.trim() ||
    typeof config.baseUrl !== "string" ||
    savedBaseUrl !== baseUrl ||
    config.authMode !== input.authMode ||
    (input.authMode === "cloud" &&
      (typeof config.email !== "string" ||
        (input.email ? config.email !== input.email : !config.email)))
  ) {
    throw new HTTPException(400, {
      message: "Enter credentials to verify this Jira instance.",
    });
  }
  return String(config.apiToken);
}
