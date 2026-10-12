import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { integrationTable } from "../../database/schema";
import { readSyncRules } from "../../plugins/sync/rules";
import type { IntegrationDatabase } from "../../plugins/github/services/integration-task-scope";

// RFC 0001 WP5: the sync surface resolves its binding by integration id;
// no lookup on (projectId, provider) remains.

function assertSyncRules(integration: { config: string }) {
  if (!readSyncRules(integration.config))
    throw new HTTPException(409, {
      message: "Invalid sync rules; repair the integration configuration",
    });
  return integration;
}

export async function getSyncIntegration(
  integrationId: string,
  database: IntegrationDatabase = db,
) {
  const integration = await database.query.integrationTable.findFirst({
    where: eq(integrationTable.id, integrationId),
    with: { project: true },
  });
  if (!integration)
    throw new HTTPException(404, { message: "Integration not found" });
  return assertSyncRules(integration);
}
