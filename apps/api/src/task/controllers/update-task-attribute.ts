import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { withLockedTask } from "./with-locked-task";
import { activityTable, taskTable } from "../../database/schema";
import { publishEvent } from "../../events";
import {
  assertTaskAttributeInWorkspace,
  findTaskAttributeRef,
  type TaskAttributeRef,
} from "../../task-attribute/resolve-task-attribute";
import { getProjectWorkspaceId } from "../../utils/assert-assignable-user";

async function updateTaskAttribute({
  id,
  attributeId,
  currentUserId,
}: {
  id: string;
  attributeId: string | null;
  currentUserId: string;
}) {
  const { before: existingTask, after } = await withLockedTask(
    id,
    async (tx, locked) => {
      let newAttributeRef: TaskAttributeRef | undefined;
      if (attributeId) {
        newAttributeRef = await assertTaskAttributeInWorkspace(
          attributeId,
          await getProjectWorkspaceId(locked.projectId),
        );
      }
      const oldAttributeRef = locked.attributeId
        ? await findTaskAttributeRef(locked.attributeId)
        : undefined;

      const [updatedTask] = await tx
        .update(taskTable)
        .set({ attributeId })
        .where(eq(taskTable.id, id))
        .returning();

      if (!updatedTask) {
        throw new HTTPException(500, {
          message: "Failed to update task attribute",
        });
      }

      if (locked.attributeId !== attributeId) {
        await tx.insert(activityTable).values({
          taskId: locked.id,
          type: "attribute_changed",
          userId: currentUserId,
          content: null,
          eventData: {
            oldAttributeId: locked.attributeId,
            oldAttributeName: oldAttributeRef?.name ?? null,
            newAttributeId: attributeId,
            newAttributeName: newAttributeRef?.name ?? null,
          },
        });
      }

      return { updatedTask, newAttributeRef, oldAttributeRef };
    },
  );

  if (existingTask.attributeId !== attributeId) {
    await publishEvent("task.attribute_changed", {
      taskId: after.updatedTask.id,
      projectId: after.updatedTask.projectId,
      title: after.updatedTask.title,
      userId: currentUserId,
      oldAttributeId: existingTask.attributeId,
      oldAttributeName: after.oldAttributeRef?.name ?? null,
      newAttributeId: attributeId,
      newAttributeName: after.newAttributeRef?.name ?? null,
      type: "attribute_changed",
    });
  }

  return { ...after.updatedTask, attribute: after.newAttributeRef ?? null };
}

export default updateTaskAttribute;
