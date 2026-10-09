import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { taskAttributeTable } from "../../database/schema";
import { isUniqueViolation } from "./create-task-attribute";

type UpdateTaskAttributeInput = {
  name?: string;
  description?: string | null;
  icon?: string;
  iconColor?: string;
  textColor?: string;
  isDefault?: boolean;
  position?: number;
};

async function updateTaskAttribute(
  id: string,
  input: UpdateTaskAttributeInput,
) {
  const [existing] = await db
    .select()
    .from(taskAttributeTable)
    .where(eq(taskAttributeTable.id, id))
    .limit(1);

  if (!existing) {
    throw new HTTPException(404, { message: "Task attribute not found" });
  }

  if (existing.isDefault && input.isDefault === false) {
    // RFC 0002: the workspace must always keep exactly one default
    // attribute. It can be replaced (set another attribute as default),
    // never unset.
    throw new HTTPException(400, {
      message:
        "The default task attribute cannot be unset directly; set another attribute as the default instead",
    });
  }

  const changes: Partial<typeof taskAttributeTable.$inferInsert> = {};
  if (input.name !== undefined) changes.name = input.name;
  if (input.description !== undefined) changes.description = input.description;
  if (input.icon !== undefined) changes.icon = input.icon;
  if (input.iconColor !== undefined) changes.iconColor = input.iconColor;
  if (input.textColor !== undefined) changes.textColor = input.textColor;
  if (input.isDefault !== undefined) changes.isDefault = input.isDefault;
  if (input.position !== undefined) changes.position = input.position;

  if (Object.keys(changes).length === 0) return existing;

  try {
    return await db.transaction(async (tx) => {
      if (input.isDefault === true && !existing.isDefault) {
        await tx
          .update(taskAttributeTable)
          .set({ isDefault: false })
          .where(
            and(
              eq(taskAttributeTable.workspaceId, existing.workspaceId),
              eq(taskAttributeTable.isDefault, true),
            ),
          );
      }

      const [updated] = await tx
        .update(taskAttributeTable)
        .set(changes)
        .where(eq(taskAttributeTable.id, id))
        .returning();

      if (!updated) throw new Error("Task attribute was not updated");
      return updated;
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new HTTPException(409, {
        message:
          "A task attribute with this name already exists in the workspace",
      });
    }
    throw error;
  }
}

export default updateTaskAttribute;
