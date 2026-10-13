import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../database";
import {
  integrationTable,
  projectTable,
  workspaceTable,
} from "../database/schema";
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
import {
  getMatrixWhoami,
  joinMatrixRoom,
  resolveRoomAlias,
  safeMatrixError,
  sendMatrixMessage,
} from "../plugins/matrix/client";
import { ensureMatrixStructure } from "../plugins/matrix/structure";
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
  summary: "Get Matrix integration",
  description:
    "Get the Matrix integration for a project, or null when none is configured.",
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
  summary: "Create Matrix integration",
  description:
    "Connect a Matrix bot account for a project. In provision mode Kaneo creates a workspace space with a project subspace and Updates and General rooms (optionally nested under a parent space); in existing mode it joins and posts to a room you manage. The homeserver must pass destination validation and the bot credentials are verified during the request.",
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
      "The homeserver rejected the connection, or the config failed validation",
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
  summary: "Update Matrix integration",
  description:
    "Update credentials, event toggles, or the active flag. The connected space or room cannot change; disconnect and reconnect to move the project.",
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
    400: errorResponse(
      "The resulting config failed validation, or the homeserver rejected the new credentials",
    ),
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
  summary: "Delete Matrix integration",
  description:
    "Remove the Matrix integration from a project. Created spaces and rooms are kept on the homeserver.",
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

function homeserverError(error: unknown): HTTPException {
  return new HTTPException(400, {
    message: `Matrix homeserver rejected the connection: ${safeMatrixError(error)}`,
  });
}

async function requireProjectAndWorkspaceNames(projectId: string): Promise<{
  projectId: string;
  projectName: string;
  workspaceId: string;
  workspaceName: string;
}> {
  const [row] = await db
    .select({
      projectId: projectTable.id,
      projectName: projectTable.name,
      workspaceId: workspaceTable.id,
      workspaceName: workspaceTable.name,
    })
    .from(projectTable)
    .innerJoin(workspaceTable, eq(projectTable.workspaceId, workspaceTable.id))
    .where(eq(projectTable.id, projectId))
    .limit(1);

  if (!row) {
    throw new HTTPException(400, {
      message: "Unknown project, or its workspace could not be determined",
    });
  }

  return row;
}

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
      accessToken: body.accessToken,
      mode: body.mode,
      spaceNamePrefix: body.spaceNamePrefix,
      parentSpaceId: body.parentSpaceId,
      roomId: body.roomId,
      inviteUsers: body.inviteUsers,
      events: { ...defaultMatrixEvents, ...body.events },
    });

    const validation = await validateMatrixConfig(config);
    if (!validation.valid) {
      throw new HTTPException(400, {
        message: validation.errors?.join(", ") ?? "Invalid config",
      });
    }

    // Verify the bot credentials against the homeserver before storing
    // anything; the discovered user ID is kept for display and diagnostics.
    try {
      config.botUserId = await getMatrixWhoami(
        config.homeserverUrl,
        config.accessToken,
      );
    } catch (error) {
      throw homeserverError(error);
    }

    if (config.mode === "existing") {
      if (!config.roomId) {
        throw new HTTPException(400, {
          message: "A room ID or alias is required in existing mode",
        });
      }

      try {
        let targetRoomId = config.roomId;
        if (targetRoomId.startsWith("#")) {
          const resolved = await resolveRoomAlias(
            config.homeserverUrl,
            config.accessToken,
            targetRoomId,
          );

          if (!resolved) {
            throw new HTTPException(400, {
              message: "The room alias could not be resolved",
            });
          }

          targetRoomId = resolved;
        }
        await joinMatrixRoom(
          config.homeserverUrl,
          config.accessToken,
          targetRoomId,
        );
        config.roomId = targetRoomId;
      } catch (error) {
        if (error instanceof HTTPException) throw error;
        throw homeserverError(error);
      }
    } else {
      const names = await requireProjectAndWorkspaceNames(projectId);

      let structure;
      try {
        structure = await ensureMatrixStructure(config, names);
      } catch (error) {
        throw homeserverError(error);
      }

      config.spaceId = structure.spaceId;
      config.updatesRoomId = structure.roomId;
      config.generalRoomId = structure.generalRoomId;

      // The welcome notice is cosmetic; a failure never fails the connect.
      try {
        await sendMatrixMessage(
          config.homeserverUrl,
          config.accessToken,
          structure.roomId,
          `<strong>Kaneo connected.</strong> Task updates for <strong>${names.projectName}</strong> will be posted in this room.`,
          `Kaneo connected. Task updates for ${names.projectName} will be posted in this room.`,
        );
      } catch (error) {
        console.error("Matrix welcome notice failed", {
          error: safeMatrixError(error),
          projectId,
        });
      }
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
      body.isActive !== undefined ? body.isActive : (existing.isActive ?? true);

    if (
      JSON.stringify(currentConfig) === JSON.stringify(nextConfig) &&
      resolvedIsActive === (existing.isActive ?? true)
    ) {
      return c.json(toResponse(existing), 200);
    }

    const validation = await validateMatrixConfig(nextConfig);
    if (!validation.valid) {
      throw new HTTPException(400, {
        message: validation.errors?.join(", ") ?? "Invalid config",
      });
    }

    if (body.homeserverUrl !== undefined || body.accessToken !== undefined) {
      // Re-verify the bot account whenever credentials change.
      try {
        nextConfig.botUserId = await getMatrixWhoami(
          nextConfig.homeserverUrl,
          nextConfig.accessToken,
        );
      } catch (error) {
        throw homeserverError(error);
      }
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
