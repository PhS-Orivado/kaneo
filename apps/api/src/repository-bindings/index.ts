import {
  apiRouter,
  type BaseVariables,
  createRoute,
  errorResponse,
  jsonResponse,
} from "../openapi";
import { workspaceAccess } from "../utils/workspace-access-middleware";
import listProjectRepositoryBindings from "./controllers/list-project-repository-bindings";
import { repositoryBindingListSchema } from "./response";
import { projectIdParam } from "./schema";

const listRepositoryBindingsRoute = createRoute({
  method: "get",
  operationId: "listProjectRepositoryBindings",
  path: "/project/{projectId}",
  tags: ["Repository Bindings"],
  summary: "List the project's linked repositories",
  description:
    "List every GitHub, Gitea and GitLab repository bound to the project, without configuration secrets. Readable by any workspace member so task dialogs can offer repository choices.",
  middleware: [workspaceAccess.fromProject("projectId")] as const,
  request: { params: projectIdParam },
  responses: {
    200: jsonResponse(
      "The project's repository bindings",
      repositoryBindingListSchema,
    ),
    400: errorResponse(
      "Unknown project, or its workspace could not be determined",
    ),
    403: errorResponse("No access to the project's workspace"),
  },
});

const repositoryBindings = apiRouter<
  BaseVariables & { workspaceId: string }
>().openapi(listRepositoryBindingsRoute, async (c) => {
  const { projectId } = c.req.valid("param");
  return c.json(await listProjectRepositoryBindings({ projectId }), 200);
});

export default repositoryBindings;
