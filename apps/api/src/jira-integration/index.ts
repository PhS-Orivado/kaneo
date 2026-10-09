import { and, eq } from "drizzle-orm";
import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import db from "../database";
import { publishEvent } from "../events";
import { integrationTable } from "../database/schema";
import { integrationIdParam, projectIdParam } from "../integrations/schema";
import {
  assertRepositoryBindingQuota,
  getRepositoryBindingUsage,
} from "../plan-limits/repository-binding-quota";
import {
  apiRouter,
  type BaseVariables,
  createRoute,
  errorResponse,
  jsonResponse,
} from "../openapi";
import { type JiraConfig, validateJiraConfig } from "../plugins/jira/config";
import { handleJiraWebhookRequest } from "../plugins/jira/webhook-handler";
import {
  hasWorkspacePermission,
  requireWorkspacePermission,
} from "../utils/require-workspace-permission";
import { workspaceAccess } from "../utils/workspace-access-middleware";
import createJiraIntegration from "./controllers/create-jira-integration";
import deleteJiraIntegration from "./controllers/delete-jira-integration";
import getJiraIntegration, {
  getJiraIntegrationById,
  listJiraIntegrations,
} from "./controllers/get-jira-integration";
import { importJiraIssues } from "./controllers/import-jira-issues";
import listJiraProjects from "./controllers/list-jira-projects";
import { resolveVerificationToken } from "./controllers/resolve-verification-token";
import verifyJiraAccess from "./controllers/verify-jira-access";
import {
  integrationNotFoundSchema,
  jiraDeleteResultSchema,
  jiraImportResultSchema,
  jiraIntegrationListSchema,
  jiraIntegrationSchema,
  jiraProjectListSchema,
  jiraVerificationResultSchema,
} from "./response";
import {
  createJiraBody,
  importJiraBody,
  listJiraProjectsBody,
  updateJiraBody,
  verifyJiraBody,
} from "./schema";

// The Jira surface mirrors the Gitea integration surface: list and link keep
// the project-keyed composition; detail, update and delete resolve
// integration -> project -> workspace via workspaceAccess.fromIntegration and
// require manage_settings for mutations. The same Jira project may be bound
// in several projects; each binding has its own webhook secret and its own
// webhook route (/webhook/:integrationId, registered in Jira, one
// registration per binding with its own secret).
const manageAccess = [
  workspaceAccess.fromProject("projectId"),
  requireWorkspacePermission({ workspace: ["manage_settings"] }),
];

const listProjectsRoute = createRoute({
  method: "post",
  operationId: "listJiraProjects",
  path: "/projects",
  tags: ["Jira"],
  summary: "List Jira projects",
  description:
    "List the Jira projects the credentials can reach, for picking one to link. Sent as a POST because the token travels in the body rather than the URL. Each project is annotated with its linked state: same-project links block selection, cross-project links are informational only.",
  middleware: manageAccess,
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: listJiraProjectsBody } },
    },
  },
  responses: {
    200: jsonResponse("Accessible Jira projects", jiraProjectListSchema),
    400: errorResponse(
      "Invalid body, unknown project, or invalid Jira credentials",
    ),
    403: errorResponse(
      "No workspace access, or missing workspace:manage_settings",
    ),
  },
});

const verifyRoute = createRoute({
  method: "post",
  operationId: "verifyJiraAccess",
  path: "/verify",
  tags: ["Jira"],
  summary: "Verify Jira access",
  description:
    "Check that the base URL is a Jira instance and that the credentials can reach the project Kaneo needs. Project lookup failures are reported in the body; invalid credentials and upstream errors return an error status. Omit apiToken to use the saved token for the unchanged base URL.",
  middleware: manageAccess,
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: verifyJiraBody } },
    },
  },
  responses: {
    200: jsonResponse("Verification result", jiraVerificationResultSchema),
    401: errorResponse("Kaneo authentication required"),
    500: errorResponse("Jira verification failed"),
    400: errorResponse(
      "Invalid body, unknown project, or invalid Jira credentials",
    ),
    403: errorResponse(
      "No workspace access, or missing workspace:manage_settings",
    ),
  },
});

const listIntegrationsRoute = createRoute({
  method: "get",
  operationId: "listJiraIntegrations",
  path: "/project/{projectId}/integrations",
  tags: ["Jira"],
  summary: "List Jira integrations",
  description:
    "List every Jira project bound to the project, oldest first, together with the workspace's repository binding usage summary. Requires workspace:manage_settings, so each row includes its own webhook secret.",
  middleware: manageAccess,
  request: { params: projectIdParam },
  responses: {
    200: jsonResponse(
      "The project's Jira bindings and the repository binding usage",
      jiraIntegrationListSchema,
    ),
    400: errorResponse(
      "Unknown project, or its workspace could not be determined",
    ),
    403: errorResponse(
      "No workspace access, or missing workspace:manage_settings",
    ),
  },
});

const getIntegrationByIdRoute = createRoute({
  method: "get",
  operationId: "getJiraIntegrationById",
  path: "/integration/{integrationId}",
  tags: ["Jira"],
  summary: "Get a Jira integration by id",
  description:
    "Get one Jira project binding, or null when the id does not exist. Authorization resolves integration -> project -> workspace; the webhook secret is per row, so a caller never sees another binding's secret.",
  middleware: [
    workspaceAccess.fromIntegration("integrationId"),
    requireWorkspacePermission({ workspace: ["manage_settings"] }),
  ] as const,
  request: { params: integrationIdParam },
  responses: {
    200: jsonResponse(
      "Jira integration details, or null",
      jiraIntegrationSchema.nullable(),
    ),
    403: errorResponse("No access to the integration's workspace"),
    404: errorResponse("Integration not found"),
  },
});

const getIntegrationRoute = createRoute({
  method: "get",
  operationId: "getJiraIntegration",
  path: "/project/{projectId}",
  tags: ["Jira"],
  summary: "Get Jira integration",
  description:
    "Compatibility shim: returns the project's first Jira binding (lowest createdAt). Use GET /project/{projectId}/integrations and GET /integration/{integrationId}.",
  middleware: [workspaceAccess.fromProject("projectId")] as const,
  request: { params: projectIdParam },
  responses: {
    200: jsonResponse(
      "Jira integration details, or null",
      jiraIntegrationSchema.nullable(),
    ),
    400: errorResponse(
      "Unknown project, or its workspace could not be determined",
    ),
    403: errorResponse("No access to the project's workspace"),
  },
});

const createIntegrationRoute = createRoute({
  method: "post",
  operationId: "createJiraIntegration",
  path: "/project/{projectId}",
  tags: ["Jira"],
  summary: "Create Jira integration",
  description:
    "Link a project to one Jira project, generating the per-binding webhook secret for the webhook Jira will post events to. A project can hold multiple Jira bindings, and the same Jira project may be linked in other projects; only same-project duplicates are rejected. Use the verify route first to confirm the credentials really reach the project.",
  middleware: manageAccess,
  request: {
    params: projectIdParam,
    body: {
      required: true,
      content: { "application/json": { schema: createJiraBody } },
    },
  },
  responses: {
    200: jsonResponse("The stored integration", jiraIntegrationSchema),
    409: errorResponse(
      "The Jira project is already linked to this project (repository_already_linked)",
    ),
    402: errorResponse(
      "The plan's repository binding limit is reached (binding_limit_exceeded)",
    ),
    400: errorResponse("Invalid body, or unknown project"),
    403: errorResponse(
      "No workspace access, or missing workspace:manage_settings",
    ),
  },
});

const updateIntegrationRoute = createRoute({
  method: "patch",
  operationId: "updateJiraIntegration",
  path: "/integration/{integrationId}",
  tags: ["Jira"],
  summary: "Update Jira integration",
  description:
    "Update one Jira project binding by id. Omitted fields keep their current value. Reactivating an inactive binding (isActive false to true) enforces the plan's repository binding quota first.",
  middleware: [
    workspaceAccess.fromIntegration("integrationId"),
    requireWorkspacePermission({ workspace: ["manage_settings"] }),
  ] as const,
  request: {
    params: integrationIdParam,
    body: {
      required: true,
      content: { "application/json": { schema: updateJiraBody } },
    },
  },
  responses: {
    200: jsonResponse("The updated integration", jiraIntegrationSchema),
    409: errorResponse("Integration changed; refresh before updating settings"),
    402: errorResponse(
      "The plan's repository binding limit is reached (binding_limit_exceeded)",
    ),
    400: errorResponse("The resulting config failed validation"),
    403: errorResponse(
      "No workspace access, or missing workspace:manage_settings",
    ),
    404: jsonResponse("Integration not found", integrationNotFoundSchema),
  },
});

const deleteIntegrationRoute = createRoute({
  method: "delete",
  operationId: "deleteJiraIntegration",
  path: "/integration/{integrationId}",
  tags: ["Jira"],
  summary: "Delete Jira integration",
  description:
    "Unlink one Jira project binding. Its issue links are removed with it; tasks created from its issues remain in the project. Other bindings of the same Jira project keep working, including their webhook routes.",
  middleware: [
    workspaceAccess.fromIntegration("integrationId"),
    requireWorkspacePermission({ workspace: ["manage_settings"] }),
  ] as const,
  request: { params: integrationIdParam },
  responses: {
    200: jsonResponse("The integration was removed", jiraDeleteResultSchema),
    403: errorResponse(
      "No workspace access, or missing workspace:manage_settings",
    ),
    404: errorResponse("Jira integration not found"),
  },
});

const importIssuesRoute = createRoute({
  method: "post",
  operationId: "importJiraIssues",
  path: "/import-issues",
  tags: ["Jira"],
  summary: "Import Jira issues",
  description:
    "Import the linked Jira project's issues as tasks for one Jira binding (integrationId). Issues that already have a task are refreshed rather than duplicated; a refresh never changes task status, statuses flow inbound through webhook transitions. A projectId in the body is accepted for compat and must match the binding's project.",
  middleware: [
    workspaceAccess.fromIntegration("integrationId"),
    requireWorkspacePermission({ task: ["create", "update"] }),
  ] as const,
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: importJiraBody } },
    },
  },
  responses: {
    200: jsonResponse("Import summary", jiraImportResultSchema),
    400: errorResponse("integrationId is required"),
    403: errorResponse(
      "No workspace access, or missing task:create or task:update permission",
    ),
    404: errorResponse("Integration or project not found"),
  },
});

const jiraIntegration = apiRouter<BaseVariables & { workspaceId: string }>()
  .openapi(listProjectsRoute, async (c) => {
    const { baseUrl, authMode, email, apiToken } = c.req.valid("json");
    const result = await listJiraProjects({
      baseUrl,
      authMode,
      email,
      apiToken,
    });
    return c.json(result, 200);
  })
  .openapi(verifyRoute, async (c) => {
    const body = c.req.valid("json");
    const apiToken = await resolveVerificationToken(body);
    const result = await verifyJiraAccess({ ...body, apiToken });
    return c.json(result, 200);
  })
  .openapi(listIntegrationsRoute, async (c) => {
    const { projectId } = c.req.valid("param");
    const integrations = await listJiraIntegrations(projectId, true);
    const usage = await getRepositoryBindingUsage(
      projectId,
      c.get("workspaceId"),
    );
    return c.json({ integrations, usage }, 200);
  })
  .openapi(getIntegrationByIdRoute, async (c) => {
    const { integrationId } = c.req.valid("param");
    const integration = await getJiraIntegrationById(integrationId, true);
    return c.json(integration, 200);
  })
  .openapi(getIntegrationRoute, async (c) => {
    const { projectId } = c.req.valid("param");
    const includeWebhookSecret = await hasWorkspacePermission(c, {
      workspace: ["manage_settings"],
    });
    const integration = await getJiraIntegration(
      projectId,
      includeWebhookSecret,
    );
    return c.json(integration, 200);
  })
  .openapi(createIntegrationRoute, async (c) => {
    const { projectId } = c.req.valid("param");
    const body = c.req.valid("json");

    const created = await createJiraIntegration({
      projectId,
      baseUrl: body.baseUrl,
      authMode: body.authMode,
      email: body.email,
      apiToken: body.apiToken,
      projectKey: body.projectKey,
      issueType: body.issueType,
      statusMap: body.statusMap,
    });

    const integration = await getJiraIntegrationById(created.id, true);
    if (!integration) {
      throw new HTTPException(500, { message: "Failed to load integration" });
    }

    await publishEvent("integration.sync_rules_changed", {
      projectId,
      integrationId: created.id,
    });
    return c.json(integration, 200);
  })
  .openapi(updateIntegrationRoute, async (c) => {
    const { integrationId } = c.req.valid("param");
    const body = c.req.valid("json");

    const row = await db.query.integrationTable.findFirst({
      where: eq(integrationTable.id, integrationId),
    });

    if (!row) {
      return c.json({ error: "Integration not found" }, 404);
    }

    // Reactivation re-enters the binding count, so the quota guard runs
    // before the update writes isActive=true.
    if (body.isActive === true && !row.isActive) {
      await assertRepositoryBindingQuota(row.projectId, c.get("workspaceId"));
    }

    let config: JiraConfig;
    try {
      config = JSON.parse(row.config) as JiraConfig;
    } catch {
      throw new HTTPException(500, { message: "Invalid integration config" });
    }

    if (body.commentTaskLinkOnJiraIssue !== undefined) {
      config = {
        ...config,
        commentTaskLinkOnJiraIssue: body.commentTaskLinkOnJiraIssue,
      };
    }
    if (body.issueType !== undefined) {
      config = { ...config, issueType: body.issueType };
    }
    if (body.statusMap !== undefined) {
      config = {
        ...config,
        ...(body.statusMap ? { statusMap: body.statusMap } : {}),
      };
    }

    const validation = await validateJiraConfig(config);
    if (!validation.valid) {
      throw new HTTPException(400, {
        message: validation.errors?.join(", ") ?? "Invalid config",
      });
    }

    const [saved] = await db
      .update(integrationTable)
      .set({
        config: JSON.stringify(config),
        isActive:
          body.isActive !== undefined ? body.isActive : (row.isActive ?? true),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(integrationTable.id, row.id),
          eq(integrationTable.config, row.config),
        ),
      )
      .returning({ id: integrationTable.id });
    if (!saved)
      throw new HTTPException(409, {
        message: "Integration changed; refresh before updating settings",
      });

    const updated = await getJiraIntegrationById(row.id, true);
    if (!updated) {
      throw new HTTPException(500, { message: "Failed to load integration" });
    }
    if (body.isActive === true && !row.isActive)
      await publishEvent("integration.sync_rules_changed", {
        projectId: row.projectId,
        integrationId: row.id,
      });
    await publishEvent("project.updated", {
      projectId: row.projectId,
      linksChanged: true,
    });
    return c.json(updated, 200);
  })
  .openapi(deleteIntegrationRoute, async (c) => {
    const { integrationId } = c.req.valid("param");
    const result = await deleteJiraIntegration(integrationId);
    return c.json(result, 200);
  })
  .openapi(importIssuesRoute, async (c) => {
    const { integrationId, projectId } = c.req.valid("json");
    const result = await importJiraIssues({ integrationId, projectId });
    return c.json(result, 200);
  });

export async function handleJiraWebhookRoute(c: Context) {
  const integrationId = c.req.param("integrationId");
  if (!integrationId) {
    return c.json({ error: "Missing integration id" }, 400);
  }

  const arrayBuffer = await c.req.arrayBuffer();
  const body = Buffer.from(arrayBuffer).toString("utf8");

  // Jira does not sign webhook deliveries itself; automation rules can. The
  // integration accepts either a HMAC-SHA256 signature header or the literal
  // secret header.
  const signature =
    c.req.header("x-hub-signature-256") ||
    c.req.header("X-Hub-Signature-256") ||
    c.req.header("x-hub-signature") ||
    c.req.header("X-Hub-Signature");

  const secret = c.req.header("x-kaneo-webhook-secret");

  const result = await handleJiraWebhookRequest(
    integrationId,
    body,
    signature,
    secret,
  );

  if (!result.success) {
    return c.json({ error: result.error }, 400);
  }

  return c.json({ status: "success" });
}

export default jiraIntegration;
