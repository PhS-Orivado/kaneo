import { and, eq, isNull } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import {
  columnTable,
  integrationTable,
  workflowRuleTable,
} from "../../database/schema";

async function upsertWorkflowRule({
  projectId,
  integrationType,
  eventType,
  columnId,
  integrationId,
}: {
  projectId: string;
  integrationType: string;
  eventType: string;
  columnId: string;
  integrationId?: string | null;
}) {
  const targetColumn = await db.query.columnTable.findFirst({
    where: and(
      eq(columnTable.id, columnId),
      eq(columnTable.projectId, projectId),
    ),
  });

  if (!targetColumn) {
    throw new HTTPException(400, {
      message: "Column does not belong to the provided project",
    });
  }

  // RFC 0001 WP6: a repository-specific rule targets one binding, which must
  // exist (404), belong to the same project (400) and match the rule's
  // integration type (400). An absent integrationId keeps the type-wide
  // semantics and the unchanged public API shape.
  if (integrationId) {
    const binding = await db.query.integrationTable.findFirst({
      where: eq(integrationTable.id, integrationId),
    });
    if (!binding)
      throw new HTTPException(404, { message: "Integration not found" });
    if (binding.projectId !== projectId)
      throw new HTTPException(400, {
        message: "Integration does not belong to the provided project",
      });
    if (binding.type !== integrationType)
      throw new HTTPException(400, {
        message: "Integration type does not match the rule's integration type",
      });
  }

  // SQL integration_id = NULL never matches with eq(); the lookup must be
  // NULL-aware so a type-wide rule and a repository-specific rule can
  // coexist for the same (project, integration type, event).
  const existing = await db.query.workflowRuleTable.findFirst({
    where: integrationId
      ? and(
          eq(workflowRuleTable.projectId, projectId),
          eq(workflowRuleTable.integrationType, integrationType),
          eq(workflowRuleTable.eventType, eventType),
          eq(workflowRuleTable.integrationId, integrationId),
        )
      : and(
          eq(workflowRuleTable.projectId, projectId),
          eq(workflowRuleTable.integrationType, integrationType),
          eq(workflowRuleTable.eventType, eventType),
          isNull(workflowRuleTable.integrationId),
        ),
  });

  if (existing) {
    const [updated] = await db
      .update(workflowRuleTable)
      .set({ columnId })
      .where(eq(workflowRuleTable.id, existing.id))
      .returning();

    if (!updated) {
      throw new HTTPException(500, {
        message: "Failed to update workflow rule",
      });
    }

    return updated;
  }

  const [created] = await db
    .insert(workflowRuleTable)
    .values({
      projectId,
      integrationType,
      integrationId: integrationId ?? null,
      eventType,
      columnId,
    })
    .returning();

  if (!created) {
    throw new HTTPException(500, {
      message: "Failed to create workflow rule",
    });
  }

  return created;
}

export default upsertWorkflowRule;
