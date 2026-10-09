import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { taskAttributeTable } from "../../database/schema";

async function reorderTaskAttribute(id: string, position: number) {
  const [existing] = await db
    .select({ id: taskAttributeTable.id })
    .from(taskAttributeTable)
    .where(eq(taskAttributeTable.id, id))
    .limit(1);

  if (!existing) {
    throw new HTTPException(404, { message: "Task attribute not found" });
  }

  const [updated] = await db
    .update(taskAttributeTable)
    .set({ position })
    .where(eq(taskAttributeTable.id, id))
    .returning();

  if (!updated) throw new Error("Task attribute was not reordered");
  return updated;
}

export default reorderTaskAttribute;
