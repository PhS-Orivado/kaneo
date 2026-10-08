import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../database";
import { integrationTable } from "../database/schema";
import { publishEvent } from "../events";
import { deletedSchema, projectIdParam } from "../integrations/schema";
import {
  apiRouter,
  type BaseVariables,
  createRoute,
  errorResponse,
  jsonResponse,
} from "../openapi";
import {
  defaultMatrixEvents,
  normalizeMatrixConfig,
  validateMatrixConfig,
} from "../plugins/matrix/config";
import { requireWorkspacePermission } from "../utils/require-workspace-permission";
import { workspaceAccess } from "../utils/workspace-access-middleware";
import {
  buildNextMatrixConfigFromPatch,
  getMatrixIntegration,
  parseMatrixIntegrationConfig,
  toResponse,
} from "./controllers/matrix-controller";
import { matrixIntegrationSchema } from "./response";
import { createMatrixBody, updateMatrixBody } from "./schema";

function safePublishIntegrationEvent(
  eventName:
    | "integration.created"
    | "integration.updated"
    | "integration.deleted",
  data: {
    projectId: string;
    userId: string;
    integrationType: "matrix";
    integrationId: string;
    apiKeyId?: string;
  },
) {
  void publishEvent(eventName, data).catch((error) => {
    console.error(`Failed to publish ${eventName}:`, error);
  });
}

const manageAccess = [
  workspaceAccess.fromProject("projectId"),
  requireWorkspacePermission({ workspace: ["manage_settings"] }),
];

const getMatrixIntegrationRoute = createRoute({
  method: "get",
  operationId: "getMatrixIntegration",
  path: "/project/{projectId}",
  tags: ["Matrix"],
  summary: "Get Element (Matrix) integration",
  description:
    "Get the Element (Matrix) integration for a project, or null when none is configured.",
  middleware: [workspaceAccess.fromProject("projectId")] as const,
  request: { params: projectIdParam },
  responses: {
    200: jsonResponse(
      "Matrix integration details, or null",
      matrixIntegrationSchema.nullable(),
    ),
    400: errorResponse(
      "Unknown project, or its workspace could not be determined",
    ),
    403: errorResponse("No access to the project's workspace"),
  },
});

const createMatrixIntegrationRoute = createRoute({
  method: "post",
  operationId: "createMatrixIntegration",
  path: "/project/{projectId}",
  tags: ["Matrix"],
  summary: "Create Element (Matrix) integration",
  description:
    "Create or replace the Element (Matrix) integration for a project. The homeserver URL, user ID, and access token are checked for shape only, not against the homeserver.",
  middleware: manageAccess,
  request: {
    params: projectIdParam,
    body: {
      required: true,
      content: { "application/json": { schema: createMatrixBody } },
    },
  },
  responses: {
    200: jsonResponse(
      "The stored integration",
      matrixIntegrationSchema.nullable(),
    ),
    400: errorResponse(
      "The homeserver URL, user ID, or access token failed validation",
    ),
    403: errorResponse(
      "No workspace access, or missing workspace:manage_settings",
    ),
  },
});

const updateMatrixIntegrationRoute = createRoute({
  method: "patch",
  operationId: "updateMatrixIntegration",
  path: "/project/{projectId}",
  tags: ["Matrix"],
  summary: "Update Element (Matrix) integration",
  description:
    "Update the Element (Matrix) integration. Omitted fields keep their current value; spaceNamePrefix and inviteUsers accept null to clear them.",
  middleware: manageAccess,
  request: {
    params: projectIdParam,
    body: {
      required: true,
      content: { "application/json": { schema: updateMatrixBody } },
    },
  },
  responses: {
    200: jsonResponse(
      "The updated integration",
      matrixIntegrationSchema.nullable(),
    ),
    400: errorResponse("The resulting config failed validation"),
    403: errorResponse(
      "No workspace access, or missing workspace:manage_settings",
    ),
    404: errorResponse("Matrix integration not found"),
  },
});

const deleteMatrixIntegrationRoute = createRoute({
  method: "delete",
  operationId: "deleteMatrixIntegration",
  path: "/project/{projectId}",
  tags: ["Matrix"],
  summary: "Delete Element (Matrix) integration",
  description: "Remove the Element (Matrix) integration from a project.",
  middleware: manageAccess,
  request: { params: projectIdParam },
  responses: {
    200: jsonResponse("The integration was removed", deletedSchema),
    400: errorResponse(
      "Unknown project, or its workspace could not be determined",
    ),
    403: errorResponse(
      "No workspace access, or missing workspace:manage_settings",
    ),
    404: errorResponse("Matrix integration not found"),
  },
});

const matrixIntegration = apiRouter<BaseVariables & { workspaceId: string }>()
  .openapi(getMatrixIntegrationRoute, async (c) => {
    const { projectId } = c.req.valid("param");
    const integration = await getMatrixIntegration(projectId);
    return c.json(integration, 200);
  })
  .openapi(createMatrixIntegrationRoute, async (c) => {
    const { projectId } = c.req.valid("param");
    const body = c.req.valid("json");

    const config = normalizeMatrixConfig({
      homeserverUrl: body.homeserverUrl,
      userId: body.userId,
      accessToken: body.accessToken,
      spaceNamePrefix: body.spaceNamePrefix,
      inviteUsers: body.inviteUsers,
      events: { ...defaultMatrixEvents, ...body.events },
    });

    const validation = validateMatrixConfig(config);
    if (!validation.valid) {
      throw new HTTPException(400, {
        message: validation.errors?.join(", ") ?? "Invalid config",
      });
    }

    const priorIntegration = await db.query.integrationTable.findFirst({
      where: and(
        eq(integrationTable.projectId, projectId),
        eq(integrationTable.type, "matrix"),
      ),
      columns: { id: true },
    });

    await db
      .insert(integrationTable)
      .values({
        projectId,
        type: "matrix",
        config: JSON.stringify(config),
        isActive: true,
      })
      .onConflictDoUpdate({
        target: [integrationTable.projectId, integrationTable.type],
        set: {
          config: JSON.stringify(config),
          updatedAt: new Date(),
        },
      });

    const integration = await getMatrixIntegration(projectId);
    if (!integration) {
      throw new HTTPException(500, {
        message: "Failed to load Matrix integration after save",
      });
    }

    const apiKey = c.get("apiKey");
    safePublishIntegrationEvent(
      priorIntegration ? "integration.updated" : "integration.created",
      {
        projectId,
        userId: c.get("userId"),
        integrationType: "matrix",
        integrationId: integration.id,
        ...(apiKey?.id ? { apiKeyId: apiKey.id } : {}),
      },
    );

    return c.json(integration, 200);
  })
  .openapi(updateMatrixIntegrationRoute, async (c) => {
    const { projectId } = c.req.valid("param");
    const body = c.req.valid("json");

    const existing = await db.query.integrationTable.findFirst({
      where: and(
        eq(integrationTable.projectId, projectId),
        eq(integrationTable.type, "matrix"),
      ),
    });

    if (!existing) {
      throw new HTTPException(404, {
        message: "Matrix integration not found",
      });
    }

    const currentConfig = parseMatrixIntegrationConfig(existing);
    const nextConfig = normalizeMatrixConfig(
      buildNextMatrixConfigFromPatch(body, currentConfig),
    );

    const resolvedIsActive =
      body.isActive !== undefined
        ? body.isActive
        : (existing.isActive ?? true);

    if (
      JSON.stringify(currentConfig) === JSON.stringify(nextConfig) &&
      resolvedIsActive === (existing.isActive ?? true)
    ) {
      return c.json(toResponse(existing), 200);
    }

    const validation = validateMatrixConfig(nextConfig);
    if (!validation.valid) {
      throw new HTTPException(400, {
        message: validation.errors?.join(", ") ?? "Invalid config",
      });
    }

    await db
      .update(integrationTable)
      .set({
        config: JSON.stringify(nextConfig),
        isActive: resolvedIsActive,
        updatedAt: new Date(),
      })
      .where(eq(integrationTable.id, existing.id));

    const integration = await getMatrixIntegration(projectId);
    if (!integration) {
      throw new HTTPException(500, {
        message: "Failed to load Matrix integration after update",
      });
    }

    const apiKey = c.get("apiKey");
    safePublishIntegrationEvent("integration.updated", {
      projectId,
      userId: c.get("userId"),
      integrationType: "matrix",
      integrationId: integration.id,
      ...(apiKey?.id ? { apiKeyId: apiKey.id } : {}),
    });

    return c.json(integration, 200);
  })
  .openapi(deleteMatrixIntegrationRoute, async (c) => {
    const { projectId } = c.req.valid("param");

    const existing = await db.query.integrationTable.findFirst({
      where: and(
        eq(integrationTable.projectId, projectId),
        eq(integrationTable.type, "matrix"),
      ),
    });

    if (!existing) {
      throw new HTTPException(404, {
        message: "Matrix integration not found",
      });
    }

    await db
      .delete(integrationTable)
      .where(eq(integrationTable.id, existing.id));

    const apiKey = c.get("apiKey");
    safePublishIntegrationEvent("integration.deleted", {
      projectId,
      userId: c.get("userId"),
      integrationType: "matrix",
      integrationId: existing.id,
      ...(apiKey?.id ? { apiKeyId: apiKey.id } : {}),
    });

    return c.json({ success: true }, 200);
  });

export default matrixIntegration;
