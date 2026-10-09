import { and, count, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { taskAttributeTable, taskTable } from "../../database/schema";

type TaskAttributeRow = typeof taskAttributeTable.$inferSelect;

type DeleteTaskAttributeResult =
  | { status: "deleted"; attribute: TaskAttributeRow }
  | { status: "blocked"; referenceCount: number };

async function deleteTaskAttribute(
  id: string,
  force = false,
): Promise<DeleteTaskAttributeResult> {
  const [existing] = await db
    .select()
    .from(taskAttributeTable)
    .where(eq(taskAttributeTable.id, id))
    .limit(1);

  if (!existing) {
    throw new HTTPException(404, { message: "Task attribute not found" });
  }

  // RFC 0002: the default attribute is the fallback target for forced
  // deletations, so it can never be deleted; callers must move the default
  // to another attribute first.
  if (existing.isDefault) {
    throw new HTTPException(409, {
      message:
        "The default task attribute cannot be deleted; set another attribute as the default first",
    });
  }

  const [reference] = await db
    .select({ value: count() })
    .from(taskTable)
    .where(eq(taskTable.attributeId, id));
  const referenceCount = reference?.value ?? 0;

  if (referenceCount > 0 && !force) {
    return { status: "blocked", referenceCount };
  }

  await db.transaction(async (tx) => {
    if (referenceCount > 0) {
      // force=true: reassign the referencing tasks to the workspace default
      // (or clear the attribute when no default exists) before deleting.
      const [workspaceDefault] = await tx
        .select({ id: taskAttributeTable.id })
        .from(taskAttributeTable)
        .where(
          and(
            eq(taskAttributeTable.workspaceId, existing.workspaceId),
            eq(taskAttributeTable.isDefault, true),
          ),
        )
        .limit(1);

      await tx
        .update(taskTable)
        .set({ attributeId: workspaceDefault?.id ?? null })
        .where(eq(taskTable.attributeId, id));
    }

    await tx.delete(taskAttributeTable).where(eq(taskAttributeTable.id, id));
  });

  return { status: "deleted", attribute: existing };
}

export default deleteTaskAttribute;
