import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import db from "../../database";
import {
  projectTable,
  taskTable,
  userTable,
  workspaceTable,
} from "../../database/schema";
import type {
  PluginContext,
  TaskAssigneeChangedEvent,
  TaskCommentCreatedEvent,
  TaskCreatedEvent,
  TaskDeletedEvent,
  TaskDescriptionChangedEvent,
  TaskDueDateChangedEvent,
  TaskMovedEvent,
  TaskPriorityChangedEvent,
  TaskStatusChangedEvent,
  TaskTitleChangedEvent,
  TaskUnassignedEvent,
} from "../types";
import { safeMatrixError, sendMatrixMessage } from "./client";
import type { MatrixConfig, MatrixEventKey } from "./config";
import { normalizeMatrixConfig, validateMatrixConfig } from "./config";
import { ensureMatrixStructure } from "./structure";

type MatrixEventData = {
  projectId: string;
  taskTitle: string;
  taskNumber: number | null;
  projectName: string;
  workspaceId: string;
  workspaceName: string;
  taskUrl: string | null;
  actorName: string | null;
  status: string | null;
  priority: string | null;
};

function isEnabled(config: MatrixConfig, key: MatrixEventKey): boolean {
  return config.events?.[key] ?? false;
}

function toSentenceCase(value: string | null): string {
  if (!value) return "Unknown";
  return value
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1)}…`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function stripTags(value: string): string {
  return value.replace(/<[^>]+>/g, "");
}

function formatDueDate(value: Date | null): string {
  return value ? value.toISOString().slice(0, 10) : "none";
}

// Provisioned integrations post to the Updates room; existing-room
// integrations post to the joined room. A provisioned integration that has
// not stored a room yet falls back to lazily provisioning the structure.
function getMatrixTargetRoomId(config: MatrixConfig): string | null {
  if (config.mode === "existing") {
    return config.roomId ?? null;
  }

  return config.updatesRoomId ?? null;
}

function getSafeMatrixTargetIdentifier(config: MatrixConfig): string {
  const hash = createHash("sha256")
    .update(
      `${config.homeserverUrl}:${getMatrixTargetRoomId(config) ?? "unprovisioned"}`,
    )
    .digest("hex")
    .slice(0, 12);

  return `mx:${hash}`;
}

function getTaskUrl(
  clientUrl: string | undefined,
  workspaceId: string,
  projectId: string,
  taskId: string,
): string | null {
  const normalizedClientUrl = clientUrl?.trim();
  if (!normalizedClientUrl) {
    return null;
  }

  try {
    return new URL(
      `/dashboard/workspace/${workspaceId}/project/${projectId}/task/${taskId}`,
      normalizedClientUrl,
    ).toString();
  } catch {
    return null;
  }
}

async function getMatrixEventData(
  taskId: string,
  projectId: string,
  userId: string | null,
): Promise<MatrixEventData | null> {
  const taskPromise = db
    .select({
      title: taskTable.title,
      number: taskTable.number,
      status: taskTable.status,
      priority: taskTable.priority,
      projectName: projectTable.name,
      projectId: projectTable.id,
      workspaceId: workspaceTable.id,
      workspaceName: workspaceTable.name,
    })
    .from(taskTable)
    .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
    .innerJoin(workspaceTable, eq(projectTable.workspaceId, workspaceTable.id))
    .where(and(eq(taskTable.id, taskId), eq(projectTable.id, projectId)))
    .limit(1);

  const userPromise = userId
    ? db
        .select({ name: userTable.name })
        .from(userTable)
        .where(eq(userTable.id, userId))
        .limit(1)
    : Promise.resolve([]);

  const [[taskRow], [user]] = await Promise.all([taskPromise, userPromise]);

  if (!taskRow) {
    return null;
  }

  return {
    projectId: taskRow.projectId,
    taskTitle: taskRow.title,
    taskNumber: taskRow.number,
    projectName: taskRow.projectName,
    workspaceId: taskRow.workspaceId,
    workspaceName: taskRow.workspaceName,
    taskUrl: getTaskUrl(
      process.env.KANEO_CLIENT_URL,
      taskRow.workspaceId,
      taskRow.projectId,
      taskId,
    ),
    actorName: user?.name ?? null,
    status: taskRow.status,
    priority: taskRow.priority,
  };
}

export function buildMatrixNoticeContent(
  title: string,
  body: string,
  data: MatrixEventData,
): { plain: string; html: string } {
  const issueKey =
    data.taskNumber !== null ? `#${data.taskNumber}` : "Task update";
  const taskLabel = `${issueKey} ${data.taskTitle}`;
  const escapedTaskLabel = escapeHtml(taskLabel);
  const taskLine = data.taskUrl
    ? `<a href="${escapeHtml(data.taskUrl)}">${escapedTaskLabel}</a>`
    : escapedTaskLabel;

  const fields = [
    ["Task", taskLine],
    ["Project", escapeHtml(data.projectName)],
    ["Status", escapeHtml(toSentenceCase(data.status))],
    ["Priority", escapeHtml(toSentenceCase(data.priority))],
    ["Triggered by", escapeHtml(data.actorName ?? "Kaneo")],
  ];

  const plain =
    [title, body, ""]
      .concat(fields.map(([label, value]) => `${label}: ${stripTags(value)}`))
      .join("\n") + (data.taskUrl ? `\n${data.taskUrl}` : "");
  const html =
    `<strong>${escapeHtml(title)}</strong><br>` +
    `${escapeHtml(body)}<br><br>` +
    fields
      .map(([label, value]) => `<strong>${label}:</strong> ${value}`)
      .join("<br>");

  return { plain, html };
}

async function sendMatrixNotification(
  config: MatrixConfig,
  title: string,
  body: string,
  data: MatrixEventData,
): Promise<void> {
  let roomId = getMatrixTargetRoomId(config);

  if (!roomId && config.mode !== "existing") {
    try {
      const structure = await ensureMatrixStructure(config, {
        workspaceId: data.workspaceId,
        workspaceName: data.workspaceName,
        projectId: data.projectId,
        projectName: data.projectName,
      });
      roomId = structure.roomId;
    } catch (error) {
      console.error("sendMatrixNotification ensureMatrixStructure failed", {
        error: safeMatrixError(error),
        matrixTarget: getSafeMatrixTargetIdentifier(config),
        taskUrl: data.taskUrl,
      });
      return;
    }
  }

  if (!roomId) {
    console.error("Matrix target room is missing; skipping notification", {
      reason: "Missing target room",
      matrixTarget: getSafeMatrixTargetIdentifier(config),
      taskUrl: data.taskUrl,
    });
    return;
  }

  const { plain, html } = buildMatrixNoticeContent(title, body, data);

  try {
    await sendMatrixMessage(
      config.homeserverUrl,
      config.accessToken,
      roomId,
      html,
      plain,
    );
  } catch (error) {
    console.error("sendMatrixNotification sendMatrixMessage failed", {
      error: safeMatrixError(error),
      matrixTarget: getSafeMatrixTargetIdentifier(config),
      taskUrl: data.taskUrl,
    });
  }
}

type MatrixMessageContent = {
  title: string;
  body: string;
};

async function runMatrixHandler(
  context: PluginContext,
  event: {
    taskId: string;
    projectId: string;
    userId: string | null;
  },
  featureKey: MatrixEventKey,
  buildMessage: () => MatrixMessageContent,
): Promise<void> {
  const validation = await validateMatrixConfig(context.config);
  if (!validation.valid) {
    console.error("Invalid Matrix plugin config; skipping event dispatch", {
      reason: "Invalid configuration",
      featureKey,
      projectId: event.projectId,
      taskId: event.taskId,
    });
    return;
  }

  const config = normalizeMatrixConfig(context.config as MatrixConfig);
  if (!isEnabled(config, featureKey)) return;

  const data = await getMatrixEventData(
    event.taskId,
    event.projectId,
    event.userId,
  );
  if (!data) return;

  const { title, body } = buildMessage();
  await sendMatrixNotification(config, title, body, data);
}

export async function handleTaskCreated(
  event: TaskCreatedEvent,
  context: PluginContext,
): Promise<void> {
  await runMatrixHandler(context, event, "taskCreated", () => ({
    title: "New task created",
    body: `A new task was added: ${event.title}`,
  }));
}

export async function handleTaskStatusChanged(
  event: TaskStatusChangedEvent,
  context: PluginContext,
): Promise<void> {
  await runMatrixHandler(context, event, "taskStatusChanged", () => ({
    title: "Task status changed",
    body: `${event.title} moved from ${toSentenceCase(event.oldStatus)} to ${toSentenceCase(event.newStatus)}.`,
  }));
}

export async function handleTaskPriorityChanged(
  event: TaskPriorityChangedEvent,
  context: PluginContext,
): Promise<void> {
  await runMatrixHandler(context, event, "taskPriorityChanged", () => ({
    title: "Task priority changed",
    body: `${event.title} changed from ${toSentenceCase(event.oldPriority)} to ${toSentenceCase(event.newPriority)}.`,
  }));
}

export async function handleTaskTitleChanged(
  event: TaskTitleChangedEvent,
  context: PluginContext,
): Promise<void> {
  await runMatrixHandler(context, event, "taskTitleChanged", () => ({
    title: "Task title changed",
    body: `Task renamed from ${truncate(event.oldTitle, 120)} to ${truncate(event.newTitle, 120)}.`,
  }));
}

export async function handleTaskDescriptionChanged(
  event: TaskDescriptionChangedEvent,
  context: PluginContext,
): Promise<void> {
  await runMatrixHandler(context, event, "taskDescriptionChanged", () => ({
    title: "Task description changed",
    body: `The task description was updated${event.newDescription ? `: ${truncate(event.newDescription.replace(/\s+/g, " "), 160)}` : "."}`,
  }));
}

export async function handleTaskCommentCreated(
  event: TaskCommentCreatedEvent,
  context: PluginContext,
): Promise<void> {
  await runMatrixHandler(context, event, "taskCommentCreated", () => ({
    title: "New task comment",
    body: truncate(event.comment.replace(/\s+/g, " "), 200),
  }));
}

export async function handleTaskDeleted(
  event: TaskDeletedEvent,
  context: PluginContext,
): Promise<void> {
  await runMatrixHandler(context, event, "taskDeleted", () => ({
    title: "Task deleted",
    body: `${event.title} was deleted.`,
  }));
}

export async function handleTaskMoved(
  event: TaskMovedEvent,
  context: PluginContext,
): Promise<void> {
  await runMatrixHandler(context, event, "taskMoved", () => ({
    title: "Task moved",
    body: `${event.title} moved from project ${event.fromProjectName} to project ${event.toProjectName}.`,
  }));
}

export async function handleTaskDueDateChanged(
  event: TaskDueDateChangedEvent,
  context: PluginContext,
): Promise<void> {
  await runMatrixHandler(context, event, "taskDueDateChanged", () => ({
    title: "Task due date changed",
    body: `${event.title} due date changed from ${formatDueDate(event.oldDueDate)} to ${formatDueDate(event.newDueDate)}.`,
  }));
}

export async function handleTaskAssigneeChanged(
  event: TaskAssigneeChangedEvent,
  context: PluginContext,
): Promise<void> {
  await runMatrixHandler(context, event, "taskAssigneeChanged", () => ({
    title: "Task assignee changed",
    body: `${event.title} was assigned to ${event.newAssignee ?? "a new assignee"}.`,
  }));
}

export async function handleTaskUnassigned(
  event: TaskUnassignedEvent,
  context: PluginContext,
): Promise<void> {
  await runMatrixHandler(context, event, "taskUnassigned", () => ({
    title: "Task unassigned",
    body: `${event.title} was unassigned.`,
  }));
}
