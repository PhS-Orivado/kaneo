import { and, eq, max } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { taskAttributeTable } from "../../database/schema";
import { TASK_ATTRIBUTE_MAX_POSITION } from "../attribute-validation";

type CreateTaskAttributeInput = {
  name: string;
  description?: string | null;
  icon: string;
  iconColor: string;
  textColor: string;
  isDefault?: boolean;
};

// Postgres unique violation (the workspace name index is case-insensitive).
export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "23505"
  );
}

async function createTaskAttribute(
  workspaceId: string,
  input: CreateTaskAttributeInput,
) {
  try {
    return await db.transaction(async (tx) => {
      const [{ maxValue }] = await tx
        .select({ maxValue: max(taskAttributeTable.position) })
        .from(taskAttributeTable)
        .where(eq(taskAttributeTable.workspaceId, workspaceId));
      const position = Math.min(
        (maxValue ?? -1) + 1,
        TASK_ATTRIBUTE_MAX_POSITION,
      );

      const [existingDefault] = await tx
        .select({ id: taskAttributeTable.id })
        .from(taskAttributeTable)
        .where(
          and(
            eq(taskAttributeTable.workspaceId, workspaceId),
            eq(taskAttributeTable.isDefault, true),
          ),
        )
        .limit(1);

      // RFC 0002: exactly one default per workspace. The first attribute in
      // a workspace always becomes the default; afterwards the default can
      // only move to another attribute, never disappear.
      const isDefault = input.isDefault ?? !existingDefault;

      if (isDefault && existingDefault) {
        await tx
          .update(taskAttributeTable)
          .set({ isDefault: false })
          .where(
            and(
              eq(taskAttributeTable.workspaceId, workspaceId),
              eq(taskAttributeTable.isDefault, true),
            ),
          );
      }

      const [created] = await tx
        .insert(taskAttributeTable)
        .values({
          workspaceId,
          name: input.name,
          description: input.description ?? null,
          icon: input.icon,
          iconColor: input.iconColor,
          textColor: input.textColor,
          position,
          isDefault,
        })
        .returning();

      if (!created) throw new Error("Task attribute was not created");
      return created;
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

export default createTaskAttribute;
