import {
  apiRouter,
  createRoute,
  errorResponse,
  jsonResponse,
} from "../openapi";
import { requireWorkspacePermission } from "../utils/require-workspace-permission";
import { workspaceAccess } from "../utils/workspace-access-middleware";
import createSprint from "./controllers/create-sprint";
import getSprints from "./controllers/get-sprints";
import reorderSprints from "./controllers/reorder-sprints";
import updateSprint from "./controllers/update-sprint";
import { sprintListSchema, sprintSchema } from "./response";
import {
  createSprintBody,
  projectIdParam,
  reorderSprintsBody,
  sprintParam,
  updateSprintBody,
} from "./schema";

const getSprintsRoute = createRoute({
  method: "get",
  operationId: "getSprints",
  path: "/{projectId}",
  tags: ["Sprints"],
  summary: "Get sprints",
  description:
    "Get a project's sprints ordered by position, with task and completed-task counts.",
  middleware: [workspaceAccess.fromProject("projectId")] as const,
  request: { params: projectIdParam },
  responses: {
    200: jsonResponse("List of sprints ordered by position", sprintListSchema),
    400: errorResponse(
      "Unknown project, or its workspace could not be determined",
    ),
    403: errorResponse("No access to the project's workspace"),
  },
});

const createSprintRoute = createRoute({
  method: "post",
  operationId: "createSprint",
  path: "/{projectId}",
  tags: ["Sprints"],
  summary: "Create sprint",
  description:
    "Add a future sprint to the end of a project's sprint backlog. Omit the name to generate the next free 'Sprint N' name.",
  middleware: [
    workspaceAccess.fromProject("projectId"),
    requireWorkspacePermission({ project: ["update"] }),
  ] as const,
  request: {
    params: projectIdParam,
    body: {
      required: true,
      content: { "application/json": { schema: createSprintBody } },
    },
  },
  responses: {
    200: jsonResponse("The created sprint", sprintSchema),
    400: errorResponse("Invalid body, unknown project, or invalid dates"),
    403: errorResponse(
      "No workspace access, or missing project:update permission",
    ),
    409: errorResponse("A sprint with this name already exists in the project"),
  },
});

const reorderSprintsRoute = createRoute({
  method: "post",
  operationId: "reorderSprints",
  path: "/reorder/{projectId}",
  tags: ["Sprints"],
  summary: "Reorder sprints",
  description:
    "Set new positions for a project's future sprints and return the whole sprint list in its new order. Active and closed sprints keep their positions.",
  middleware: [
    workspaceAccess.fromProject("projectId"),
    requireWorkspacePermission({ project: ["update"] }),
  ] as const,
  request: {
    params: projectIdParam,
    body: {
      required: true,
      content: { "application/json": { schema: reorderSprintsBody } },
    },
  },
  responses: {
    200: jsonResponse("The reordered sprint list", sprintListSchema),
    400: errorResponse("A sprint is not a future sprint of this project"),
    403: errorResponse(
      "No workspace access, or missing project:update permission",
    ),
  },
});

const updateSprintRoute = createRoute({
  method: "put",
  operationId: "updateSprint",
  path: "/{id}",
  tags: ["Sprints"],
  summary: "Update sprint",
  description:
    "Rename a sprint, edit its goal or dates. Closed sprints are immutable; the active sprint cannot change its start date.",
  middleware: [
    workspaceAccess.fromSprint("id"),
    requireWorkspacePermission({ project: ["update"] }),
  ] as const,
  request: {
    params: sprintParam,
    body: {
      required: true,
      content: { "application/json": { schema: updateSprintBody } },
    },
  },
  responses: {
    200: jsonResponse("The updated sprint", sprintSchema),
    400: errorResponse(
      "Invalid body, unknown sprint, invalid dates, or an immutable field",
    ),
    403: errorResponse(
      "No workspace access, or missing project:update permission",
    ),
    404: errorResponse("Sprint not found"),
    409: errorResponse("The sprint is closed, or the name is already taken"),
  },
});

const sprint = apiRouter()
  .openapi(getSprintsRoute, async (c) =>
    c.json(await getSprints(c.req.valid("param").projectId), 200),
  )
  .openapi(createSprintRoute, async (c) => {
    const { projectId } = c.req.valid("param");
    const { name, goal, startDate, endDate } = c.req.valid("json");
    return c.json(
      await createSprint({ projectId, name, goal, startDate, endDate }),
      200,
    );
  })
  .openapi(reorderSprintsRoute, async (c) => {
    const { projectId } = c.req.valid("param");
    const { sprints } = c.req.valid("json");
    return c.json(await reorderSprints(projectId, sprints), 200);
  })
  .openapi(updateSprintRoute, async (c) =>
    c.json(
      await updateSprint(c.req.valid("param").id, c.req.valid("json")),
      200,
    ),
  );

export default sprint;
