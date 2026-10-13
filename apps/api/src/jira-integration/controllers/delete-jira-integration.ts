import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { integrationTable } from "../../database/schema";

// Delete by integration id (primary key). Cascades remove the binding's
// external_link rows automatically; tasks created from its issues remain
// in the project.
async function deleteJiraIntegration(integrationId: string) {
  const existingIntegration = await db.query.integrationTable.findFirst({
    where: eq(integrationTable.id, integrationId),
  });

  if (!existingIntegration) {
    throw new HTTPException(404, { message: "Jira integration not found" });
  }

  await db
    .delete(integrationTable)
    .where(eq(integrationTable.id, integrationId));

  return { success: true, message: "Jira integration deleted" };
}

export default deleteJiraIntegration;
