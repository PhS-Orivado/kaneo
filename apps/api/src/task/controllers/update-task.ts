import { and, eq, getTableColumns, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import {
  activityTable,
  columnTable,
  projectTable,
  taskTable,
} from "../../database/schema";
import { publishEvent } from "../../events";
import {
  publishTaskMutation,
  recordTaskMutation,
} from "./task-mutation-effects";
import {
  assertTaskAttributeInWorkspace,
  findTaskAttributeRef,
  type TaskAttributeRef,
} from "../../task-attribute/resolve-task-attribute";
import {
  assertAssignableUser,
  getProjectWorkspaceId,
} from "../../utils/assert-assignable-user";
import { boardDescription, descriptionDeferred } from "../description-pages";
import { assertValidTaskStatus } from "../validate-task-fields";
import { assertTaskPosition } from "./next-task-position";

async function updateTask(
  id: string,
  title: string,
  status: string,
  startDate: Date | undefined,
  dueDate: Date | undefined,
  projectId: string,
  description: string | undefined,
  priority: string,
  position: number,
  attributeId?: string | null,
  userId?: string,
  currentUserId?: string,
) {
  assertTaskPosition(position);

  let [existingTask] = await db
    .select({
      id: taskTable.id,
      title: taskTable.title,
      priority: taskTable.priority,
      userId: taskTable.userId,
      dueDate: taskTable.dueDate,
      description:
        description === undefined ? sql<null>`null` : taskTable.description,
      status: taskTable.status,
      position: taskTable.position,
      projectId: taskTable.projectId,
      attributeId: taskTable.attributeId,
    })
    .from(taskTable)
    .where(eq(taskTable.id, id))
    .limit(1);

  if (!existingTask) {
    throw new HTTPException(404, {
      message: "Task not found",
    });
  }

  if (projectId !== existingTask.projectId) {
    throw new HTTPException(400, {
      message: "Use the task move endpoint to move tasks between projects",
    });
  }

  await assertValidTaskStatus(status, projectId);

  const normalizedUserId = userId?.trim() || undefined;

  // RFC 0002: an omitted attributeId keeps the current attribute; an explicit
  // null clears it; an id must belong to the task's workspace.
  let resolvedAttributeId: string | null | undefined;
  let newAttributeRef: TaskAttributeRef | undefined;
  if (attributeId !== undefined) {
    if (attributeId) {
      newAttributeRef = await assertTaskAttributeInWorkspace(
        attributeId,
        await getProjectWorkspaceId(projectId),
      );
    }
    resolvedAttributeId = attributeId;
  }

  if (normalizedUserId && normalizedUserId !== existingTask.userId) {
    await assertAssignableUser(
      normalizedUserId,
      await getProjectWorkspaceId(projectId),
      projectId,
    );
  }

  const column = await db.query.columnTable.findFirst({
    where: and(
      eq(columnTable.projectId, projectId),
      eq(columnTable.slug, status),
    ),
  });

  const initialPosition = existingTask.position;
  const initialStatus = existingTask.status;
  const updatedTask = await db.transaction(async (tx) => {
    const [project] = await tx
      .select({ id: projectTable.id })
      .from(projectTable)
      .where(eq(projectTable.id, projectId))
      .for("update");
    if (!project)
      throw new HTTPException(404, { message: "Project not found" });
    const [locked] = await tx
      .select({
        id: taskTable.id,
        title: taskTable.title,
        priority: taskTable.priority,
        userId: taskTable.userId,
        dueDate: taskTable.dueDate,
        description:
          description === undefined ? sql<null>`null` : taskTable.description,
        status: taskTable.status,
        columnId: taskTable.columnId,
        position: taskTable.position,
        projectId: taskTable.projectId,
        attributeId: taskTable.attributeId,
      })
      .from(taskTable)
      .where(and(eq(taskTable.id, id), eq(taskTable.projectId, projectId)))
      .for("update");
    if (!locked)
      throw new HTTPException(409, {
        message: "Task changed projects; retry the update",
      });
    if (locked.position !== initialPosition || locked.status !== initialStatus)
      throw new HTTPException(409, {
        message: "Task order changed; refresh before updating",
      });
    existingTask = locked;

    const [task] = await tx
      .update(taskTable)
      .set({
        title,
        status,
        columnId: column?.id ?? null,
        startDate: startDate || null,
        dueDate: dueDate || null,
        projectId,
        description,
        priority,
        position,
        userId: normalizedUserId ?? null,
        ...(resolvedAttributeId !== undefined
          ? { attributeId: resolvedAttributeId }
          : {}),
      })
      .where(and(eq(taskTable.id, id), eq(taskTable.projectId, projectId)))
      .returning({
        ...getTableColumns(taskTable),
        description: boardDescription,
        descriptionDeferred,
      });
    if (task)
      await recordTaskMutation(
        tx,
        existingTask,
        { title, dueDate: dueDate ?? null },
        currentUserId,
      );
    const attributeChanged =
      resolvedAttributeId !== undefined &&
      locked.attributeId !== resolvedAttributeId;
    if (task && attributeChanged) {
      const oldAttribute = locked.attributeId
        ? await findTaskAttributeRef(locked.attributeId)
        : undefined;
      await tx.insert(activityTable).values({
        taskId: id,
        type: "attribute_changed",
        userId: currentUserId ?? null,
        content: null,
        eventData: {
          oldAttributeId: locked.attributeId,
          oldAttributeName: oldAttribute?.name ?? null,
          newAttributeId: resolvedAttributeId,
          newAttributeName: newAttributeRef?.name ?? null,
        },
      });
    }
    return task;
  });

  if (!updatedTask) {
    throw new HTTPException(500, {
      message: "Failed to update task",
    });
  }

  await publishTaskMutation(
    {
      ...existingTask,
      description:
        description === undefined ? undefined : existingTask.description,
    },
    { ...updatedTask, description: description ?? updatedTask.description },
    currentUserId,
  );

  await publishEvent("task.updated", {
    taskId: updatedTask.id,
    projectId: updatedTask.projectId,
    title: updatedTask.title,
    status: updatedTask.status,
    userId: currentUserId,
  });

  if (
    resolvedAttributeId !== undefined &&
    existingTask.attributeId !== resolvedAttributeId
  ) {
    const oldAttribute = existingTask.attributeId
      ? await findTaskAttributeRef(existingTask.attributeId)
      : undefined;
    await publishEvent("task.attribute_changed", {
      taskId: updatedTask.id,
      projectId: updatedTask.projectId,
      title: updatedTask.title,
      userId: currentUserId,
      oldAttributeId: existingTask.attributeId,
      oldAttributeName: oldAttribute?.name ?? null,
      newAttributeId: resolvedAttributeId,
      newAttributeName: newAttributeRef?.name ?? null,
      type: "attribute_changed",
    });
  }

  return {
    ...updatedTask,
    ...(resolvedAttributeId !== undefined
      ? { attribute: newAttributeRef ?? null }
      : {}),
  };
}

export default updateTask;
