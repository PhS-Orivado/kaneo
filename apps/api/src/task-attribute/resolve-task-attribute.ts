import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../database";
import { taskAttributeTable } from "../database/schema";

// RFC 0002: compact task-attribute reference embedded in task payloads. The
// full definition is served by the task-attribute endpoints; task responses
// only need the fields required to render a badge.
export type TaskAttributeRef = {
  id: string;
  name: string;
  icon: string;
  iconColor: string;
  textColor: string;
};

const taskAttributeRefColumns = {
  id: taskAttributeTable.id,
  name: taskAttributeTable.name,
  icon: taskAttributeTable.icon,
  iconColor: taskAttributeTable.iconColor,
  textColor: taskAttributeTable.textColor,
};

export async function findTaskAttributeRef(
  attributeId: string,
): Promise<TaskAttributeRef | undefined> {
  const [attribute] = await db
    .select(taskAttributeRefColumns)
    .from(taskAttributeTable)
    .where(eq(taskAttributeTable.id, attributeId))
    .limit(1);
  return attribute;
}

export async function getWorkspaceDefaultTaskAttribute(
  workspaceId: string,
): Promise<TaskAttributeRef | undefined> {
  const [attribute] = await db
    .select(taskAttributeRefColumns)
    .from(taskAttributeTable)
    .where(
      and(
        eq(taskAttributeTable.workspaceId, workspaceId),
        eq(taskAttributeTable.isDefault, true),
      ),
    )
    .orderBy(taskAttributeTable.position)
    .limit(1);
  return attribute;
}

export async function assertTaskAttributeInWorkspace(
  attributeId: string,
  workspaceId: string,
): Promise<TaskAttributeRef> {
  const [attribute] = await db
    .select(taskAttributeRefColumns)
    .from(taskAttributeTable)
    .where(
      and(
        eq(taskAttributeTable.id, attributeId),
        eq(taskAttributeTable.workspaceId, workspaceId),
      ),
    )
    .limit(1);
  if (!attribute) {
    throw new HTTPException(400, {
      message: "Task attribute does not belong to this workspace",
    });
  }
  return attribute;
}
