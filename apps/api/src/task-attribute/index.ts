import { apiRouter, createRoute, errorResponse, jsonResponse } from "../openapi";
import { requireWorkspacePermission } from "../utils/require-workspace-permission";
import { workspaceAccess } from "../utils/workspace-access-middleware";
import createTaskAttribute from "./controllers/create-task-attribute";
import deleteTaskAttribute from "./controllers/delete-task-attribute";
import getTaskAttributesByWorkspaceId from "./controllers/get-task-attributes-by-workspace-id";
import reorderTaskAttribute from "./controllers/reorder-task-attribute";
import updateTaskAttribute from "./controllers/update-task-attribute";
import {
  taskAttributeDeleteBlockedSchema,
  taskAttributeListSchema,
  taskAttributeSchema,
} from "./response";
import {
  createTaskAttributeBody,
  deleteTaskAttributeQuery,
  reorderTaskAttributeBody,
  taskAttributeParam,
  updateTaskAttributeBody,
  workspaceIdParam,
} from "./schema";

const getWorkspaceTaskAttributesRoute = createRoute({
  method: "get",
  operationId: "getWorkspaceTaskAttributes",
  path: "/workspace/{workspaceId}",
  tags: ["Task Attributes"],
  summary: "Get workspace task attributes",
  description:
    "Get all task attributes (task types such as task, bug, doc) defined in a workspace, ordered by position then name",
  middleware: [workspaceAccess.fromParam()] as const,
  request: { params: workspaceIdParam },
  responses: {
    200: jsonResponse(
      "List of task attributes in the workspace",
      taskAttributeListSchema,
    ),
    400: errorResponse("Workspace ID could not be determined"),
    403: errorResponse("No access to the workspace"),
  },
});

const createTaskAttributeRoute = createRoute({
  method: "post",
  operationId: "createTaskAttribute",
  path: "/",
  tags: ["Task Attributes"],
  summary: "Create task attribute",
  description: "Define a new task attribute (task type) in a workspace",
  middleware: [
    workspaceAccess.fromBody(),
    requireWorkspacePermission({ taskAttribute: ["create"] }),
  ] as const,
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: createTaskAttributeBody } },
    },
  },
  responses: {
    200: jsonResponse("Task attribute created successfully", taskAttributeSchema),
    400: errorResponse(
      "Invalid body, or workspace ID could not be determined",
    ),
    403: errorResponse(
      "No workspace access, or missing taskAttribute:create permission",
    ),
    409: errorResponse(
      "A task attribute with this name already exists in the workspace",
    ),
  },
});

const updateTaskAttributeRoute = createRoute({
  method: "put",
  operationId: "updateTaskAttribute",
  path: "/{id}",
  tags: ["Task Attributes"],
  summary: "Update task attribute",
  description:
    "Update an existing task attribute. Setting isDefault to true moves the workspace default to this attribute; the default cannot be unset directly.",
  middleware: [
    workspaceAccess.fromTaskAttribute(),
    requireWorkspacePermission({ taskAttribute: ["update"] }),
  ] as const,
  request: {
    params: taskAttributeParam,
    body: {
      required: true,
      content: { "application/json": { schema: updateTaskAttributeBody } },
    },
  },
  responses: {
    200: jsonResponse("Task attribute updated successfully", taskAttributeSchema),
    400: errorResponse(
      "Invalid body, or the default task attribute cannot be unset",
    ),
    403: errorResponse(
      "No workspace access, or missing taskAttribute:update permission",
    ),
    404: errorResponse("Task attribute not found"),
    409: errorResponse(
      "A task attribute with this name already exists in the workspace",
    ),
  },
});

const reorderTaskAttributeRoute = createRoute({
  method: "post",
  operationId: "reorderTaskAttribute",
  path: "/{id}/reorder",
  tags: ["Task Attributes"],
  summary: "Reorder task attribute",
  description: "Set the position of a task attribute within its workspace",
  middleware: [
    workspaceAccess.fromTaskAttribute(),
    requireWorkspacePermission({ taskAttribute: ["update"] }),
  ] as const,
  request: {
    params: taskAttributeParam,
    body: {
      required: true,
      content: { "application/json": { schema: reorderTaskAttributeBody } },
    },
  },
  responses: {
    200: jsonResponse(
      "Task attribute reordered successfully",
      taskAttributeSchema,
    ),
    400: errorResponse("Invalid body"),
    403: errorResponse(
      "No workspace access, or missing taskAttribute:update permission",
    ),
    404: errorResponse("Task attribute not found"),
  },
});

const deleteTaskAttributeRoute = createRoute({
  method: "delete",
  operationId: "deleteTaskAttribute",
  path: "/{id}",
  tags: ["Task Attributes"],
  summary: "Delete task attribute",
  description:
    "Delete a task attribute. The workspace default cannot be deleted. When tasks still reference the attribute the request is rejected with HTTP 409 and a reference count, unless force=true reassigns those tasks to the workspace default (or clears the attribute) before deleting.",
  middleware: [
    workspaceAccess.fromTaskAttribute(),
    requireWorkspacePermission({ taskAttribute: ["delete"] }),
  ] as const,
  request: {
    params: taskAttributeParam,
    query: deleteTaskAttributeQuery,
  },
  responses: {
    200: jsonResponse("Task attribute deleted successfully", taskAttributeSchema),
    400: errorResponse(
      "Unknown task attribute, or its workspace could not be determined",
    ),
    403: errorResponse(
      "No workspace access, or missing taskAttribute:delete permission",
    ),
    404: errorResponse("Task attribute not found"),
    409: jsonResponse(
      "Task attribute is still referenced by tasks; pass force=true to reassign and delete",
      taskAttributeDeleteBlockedSchema,
    ),
  },
});

const taskAttribute = apiRouter()
  .openapi(getWorkspaceTaskAttributesRoute, async (c) => {
    const { workspaceId } = c.req.valid("param");
    return c.json(await getTaskAttributesByWorkspaceId(workspaceId), 200);
  })
  .openapi(createTaskAttributeRoute, async (c) => {
    const body = c.req.valid("json");
    const created = await createTaskAttribute(body.workspaceId, {
      name: body.name,
      description: body.description ?? null,
      icon: body.icon,
      iconColor: body.iconColor,
      textColor: body.textColor,
      isDefault: body.isDefault,
    });
    return c.json(created, 200);
  })
  .openapi(updateTaskAttributeRoute, async (c) => {
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    return c.json(await updateTaskAttribute(id, body), 200);
  })
  .openapi(reorderTaskAttributeRoute, async (c) => {
    const { id } = c.req.valid("param");
    const { position } = c.req.valid("json");
    return c.json(await reorderTaskAttribute(id, position), 200);
  })
  .openapi(deleteTaskAttributeRoute, async (c) => {
    const { id } = c.req.valid("param");
    const { force } = c.req.valid("query");
    const result = await deleteTaskAttribute(id, force === "true");
    if (result.status === "blocked") {
      return c.json(
        {
          message:
            "Task attribute is still referenced by " +
            result.referenceCount +
            " task(s); pass force=true to reassign them to the workspace default and delete",
          referenceCount: result.referenceCount,
        },
        409,
      );
    }
    return c.json(result.attribute, 200);
  });

export default taskAttribute;
