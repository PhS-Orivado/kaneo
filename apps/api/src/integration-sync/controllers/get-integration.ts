import { and, asc, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { integrationTable } from "../../database/schema";
import { readSyncRules } from "../../plugins/sync/rules";
import type { IntegrationDatabase } from "../../plugins/github/services/integration-task-scope";

// RFC 0001 WP5: the sync surface is keyed by integration id. One repository
// binding owns its rules, preview tokens, paused links and resume flow; the
// addressed row is the single source of truth for all of them.
export async function getSyncIntegrationById(
  integrationId: string,
  database: IntegrationDatabase = db,
) {
  const integration = await database.query.integrationTable.findFirst({
    where: eq(integrationTable.id, integrationId),
    with: { project: true },
  });
  if (!integration)
    throw new HTTPException(404, { message: "Integration not found" });
  if (!readSyncRules(integration.config))
    throw new HTTPException(409, {
      message: "Invalid sync rules; repair the integration configuration",
    });
  return integration;
}

// Compat shim (RFC 0001 WP5, section 5): the project-keyed routes resolve the
// project's first binding of the provider (lowest createdAt) until the new
// web client ships; removed with the cleanup PR.
export async function getSyncIntegration(
  projectId: string,
  provider: string,
  database: IntegrationDatabase = db,
) {
  const [first] = await database
    .select({ id: integrationTable.id })
    .from(integrationTable)
    .where(
      and(
        eq(integrationTable.projectId, projectId),
        eq(integrationTable.type, provider),
      ),
    )
    .orderBy(asc(integrationTable.createdAt), asc(integrationTable.id))
    .limit(1);
  if (!first)
    throw new HTTPException(404, { message: "Integration not found" });
  return getSyncIntegrationById(first.id, database);
}
