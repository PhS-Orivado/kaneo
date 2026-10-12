import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import {
  externalLinkTable,
  projectTable,
  taskTable,
} from "../../database/schema";
import { publishEvent } from "../../events";
import { classifyResourceUrl } from "../classify-resource-url";

async function createExternalLink({
  taskId,
  url,
  title,
  userId,
}: {
  taskId: string;
  url: string;
  title?: string;
  userId: string;
}) {
  // A pasted GitHub/Gitea pull request or a branch tree URL becomes a
  // pull_request/branch link so it renders with the task's PRs and branches
  // instead of a plain URL entry. The link stays manual: integrationId stays
  // null, so provider sync never adopts or deletes it.
  const classified = classifyResourceUrl(url);

  const [link] = await db
    .insert(externalLinkTable)
    .values({
      taskId,
      integrationId: null,
      resourceType: classified.resourceType,
      externalId: classified.externalId ?? url,
      url,
      title: title ?? null,
    })
    .returning();

  if (!link) {
    throw new HTTPException(500, {
      message: "Failed to create external link",
    });
  }

  const [task] = await db
    .select({
      projectId: taskTable.projectId,
      title: taskTable.title,
      status: taskTable.status,
    })
    .from(taskTable)
    .innerJoin(projectTable, eq(taskTable.projectId, projectTable.id))
    .where(eq(taskTable.id, taskId))
    .limit(1);

  if (!task) {
    throw new HTTPException(404, {
      message: "Task not found",
    });
  }

  await publishEvent("task.updated", {
    taskId,
    projectId: task.projectId,
    title: task.title,
    status: task.status,
    userId,
  });

  return link;
}

export default createExternalLink;
