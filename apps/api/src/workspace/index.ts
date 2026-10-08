import {
  apiRouter,
  type BaseVariables,
  createRoute,
  errorResponse,
  jsonResponse,
} from "../openapi";
import { listWorkspaceProjectAccess } from "../project-access/list-workspace-project-access";
import { requireWorkspacePermission } from "../utils/require-workspace-permission";
import { workspaceAccess } from "../utils/workspace-access-middleware";
import createWorkspaceInvitationsCtrl from "./controllers/create-workspace-invitations";
import getMyProjectAccessCtrl from "./controllers/get-my-project-access";
import getWorkspaceMembersCtrl from "./controllers/get-workspace-members";
import updateMemberProjectAccessCtrl from "./controllers/update-member-project-access";
import {
  memberProjectAccessListSchema,
  memberProjectAccessSchema,
  workspaceInvitationListSchema,
  workspaceMemberListSchema,
} from "./response";
import {
  createWorkspaceInvitationsBody,
  updateMemberProjectAccessBody,
  workspaceIdParam,
  workspaceMemberParam,
  workspaceMembersQuery,
} from "./schema";

const getWorkspaceMembersRoute = createRoute({
  method: "get",
  operationId: "getWorkspaceMembers",
  path: "/{workspaceId}/members",
  tags: ["Workspaces"],
  summary: "Get workspace members",
  description:
    "Get all members of a workspace, with their role. Pass projectId to get only the members who can access that project.",
  middleware: [workspaceAccess.fromParam("workspaceId")] as const,
  request: { params: workspaceIdParam, query: workspaceMembersQuery },
  responses: {
    200: jsonResponse("List of workspace members", workspaceMemberListSchema),
    400: errorResponse("Workspace ID could not be determined"),
    403: errorResponse("No access to the workspace or to the project"),
    404: errorResponse("Project not found in this workspace"),
  },
});

const getWorkspaceProjectAccessRoute = createRoute({
  method: "get",
  operationId: "getWorkspaceProjectAccess",
  path: "/{workspaceId}/project-access",
  tags: ["Workspaces"],
  summary: "Get member project access",
  description:
    "List the members who are limited to selected projects, with the projects each one can access. Everyone else in the workspace can access every project. A caller whose own access is limited only sees the projects they can access.",
  middleware: [
    workspaceAccess.fromParam("workspaceId"),
    requireWorkspacePermission({ member: ["update"] }),
  ] as const,
  request: { params: workspaceIdParam },
  responses: {
    200: jsonResponse(
      "Members limited to selected projects",
      memberProjectAccessListSchema,
    ),
    400: errorResponse("Workspace ID could not be determined"),
    403: errorResponse(
      "No workspace access, or missing member:update permission",
    ),
  },
});

const getMyProjectAccessRoute = createRoute({
  method: "get",
  operationId: "getMyProjectAccess",
  path: "/{workspaceId}/project-access/me",
  tags: ["Workspaces"],
  summary: "Get my project access",
  description:
    "Get the caller's own project access in the workspace: every project, or the selected projects they're limited to. Owners and instance admins always get every project.",
  middleware: [workspaceAccess.fromParam("workspaceId")] as const,
  request: { params: workspaceIdParam },
  responses: {
    200: jsonResponse("The caller's project access", memberProjectAccessSchema),
    400: errorResponse("Workspace ID could not be determined"),
    403: errorResponse("No access to the workspace"),
  },
});

const updateMemberProjectAccessRoute = createRoute({
  method: "put",
  operationId: "updateMemberProjectAccess",
  path: "/{workspaceId}/members/{userId}/project-access",
  tags: ["Workspaces"],
  summary: "Update member project access",
  description:
    "Give a member access to every project, or limit them to selected projects. Owners always access every project, and you can't change your own access or give access to projects you can't access yourself.",
  middleware: [
    workspaceAccess.fromParam("workspaceId"),
    requireWorkspacePermission({ member: ["update"] }),
  ] as const,
  request: {
    params: workspaceMemberParam,
    body: {
      required: true,
      content: {
        "application/json": { schema: updateMemberProjectAccessBody },
      },
    },
  },
  responses: {
    200: jsonResponse("The member's project access", memberProjectAccessSchema),
    400: errorResponse(
      "Invalid body, the member is an owner, or a project is not in this workspace",
    ),
    403: errorResponse(
      "Missing member:update permission, changing your own access, or granting a project you can't access",
    ),
    404: errorResponse("Member not found"),
  },
});

const createWorkspaceInvitationsRoute = createRoute({
  method: "post",
  operationId: "createWorkspaceInvitations",
  path: "/{workspaceId}/invitations",
  tags: ["Workspaces"],
  summary: "Invite users without sending emails",
  description:
    "Create pending workspace invitations in bulk, for example when migrating from another tool. No email is sent unless an address is marked sendEmail, so the caller decides who is notified; every result includes the invitation id so the link can be shared manually. Members and existing unexpired invitations are not duplicated, matching the app's invite flow.",
  middleware: [
    workspaceAccess.fromParam("workspaceId"),
    requireWorkspacePermission({ invitation: ["create"] }),
  ] as const,
  request: {
    params: workspaceIdParam,
    body: {
      required: true,
      content: {
        "application/json": { schema: createWorkspaceInvitationsBody },
      },
    },
  },
  responses: {
    200: jsonResponse("Invitation results", workspaceInvitationListSchema),
    400: errorResponse("Invalid body or unknown role"),
    403: errorResponse(
      "No workspace access, or missing invitation:create permission",
    ),
    404: errorResponse("Workspace not found"),
  },
});

const workspace = apiRouter<BaseVariables & { workspaceId: string }>()
  .openapi(getWorkspaceMembersRoute, async (c) =>
    c.json(
      await getWorkspaceMembersCtrl({
        workspaceId: c.get("workspaceId"),
        userId: c.get("userId"),
        projectId: c.req.valid("query").projectId,
      }),
      200,
    ),
  )
  .openapi(getMyProjectAccessRoute, async (c) =>
    c.json(
      await getMyProjectAccessCtrl(c.get("workspaceId"), c.get("userId")),
      200,
    ),
  )
  .openapi(getWorkspaceProjectAccessRoute, async (c) =>
    c.json(
      await listWorkspaceProjectAccess(c.get("workspaceId"), c.get("userId")),
      200,
    ),
  )
  .openapi(updateMemberProjectAccessRoute, async (c) => {
    const { userId } = c.req.valid("param");
    const body = c.req.valid("json");
    return c.json(
      await updateMemberProjectAccessCtrl({
        workspaceId: c.get("workspaceId"),
        actorId: c.get("userId"),
        userId,
        projectAccess: body.projectAccess,
        projectIds: body.projectIds,
      }),
      200,
    );
  })
  .openapi(createWorkspaceInvitationsRoute, async (c) => {
    const body = c.req.valid("json");
    return c.json(
      await createWorkspaceInvitationsCtrl({
        workspaceId: c.get("workspaceId"),
        actorId: c.get("userId"),
        role: body.role,
        invitations: body.invitations,
      }),
      200,
    );
  });

export default workspace;
