import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../database";
import { integrationTable, projectTable } from "../database/schema";
import { deletedSchema, projectIdParam } from "../integrations/schema";
import {
  apiRouter,
  type BaseVariables,
  createRoute,
  errorResponse,
  jsonResponse,
} from "../openapi";
import { createMatrixClient } from "../plugins/matrix/client";
import {
  defaultMatrixEvents,
  type MatrixConfig,
  normalizeMatrixConfig,
  validateMatrixConfig,
} from "../plugins/matrix/config";
import { provisionMatrixStructure } from "../plugins/matrix/provision";
import { requireWorkspacePermission } from "../utils/require-workspace-permission";
import { workspaceAccess } from "../utils/workspace-access-middleware";
import { matrixIntegrationSchema } from "./response";
import { createMatrixBody, updateMatrixBody } from "./schema";

function toResponse(integration: {
  id: string;
  projectId: string;
  config: string;
  isActive: boolean | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  const config = normalizeMatrixConfig(
    JSON.parse(integration.config) as MatrixConfig,
  );

  return {
    id: integration.id,
    projectId: integration.projectId,
    mode: config.mode,
    homeserverUrl: config.homeserverUrl,
    tokenConfigured: Boolean(config.accessToken),
    botUserId: config.botUserId ?? null,
    spaceId: config.spaceId ?? null,
    spaceName: config.spaceName ?? null,
    parentSpaceId: config.parentSpaceId ?? null,
    updatesRoomId: config.updatesRoomId ?? null,
    generalRoomId: config.generalRoomId ?? null,
    roomId: config.roomId ?? null,
    events: {
      ...defaultMatrixEvents,
      ...config.events,
    },
    isActive: integration.isActive,
    createdAt: integration.createdAt,
    updatedAt: integration.updatedAt,
  };
}

async function getMatrixIntegration(projectId: string) {
  const integration = await db.query.integrationTable.findFirst({
    where: and(
      eq(integrationTable.projectId, projectId),
      eq(integrationTable.type, "matrix"),
    ),
  });

  if (!integration) {
    return null;
  }

  return toResponse(integration);
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
    "Connect a Matrix bot account for a project. In provision mode Kaneo creates a project space with Updates and General rooms (optionally nested under a parent space); in existing mode it posts to a room you manage. The homeserver must pass destination validation and the bot credentials are verified during the request.",
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

async function requireProjectName(projectId: string): Promise<string> {
  const [project] = await db
    .select({ name: projectTable.name })
    .from(projectTable)
    .where(eq(projectTable.id, projectId))
    .limit(1);

  if (!project) {
    throw new HTTPException(400, {
      message: "Unknown project, or its workspace could not be determined",
    });
  }

  return project.name;
}

function homeserverError(error: unknown): HTTPException {
  const message =
    error instanceof Error ? error.message : "Homeserver request failed";
  return new HTTPException(400, {
    message: "Matrix homeserver rejected the connection: " + message,
  });
}

const matrixIntegration = apiRouter<
  BaseVariables & { workspaceId: string }
>()
  .openapi(getMatrixIntegrationRoute, async (c) => {
    const { projectId } = c.req.valid("param");
    const integration = await getMatrixIntegration(projectId);
    return c.json(integration, 200);
  })
  .openapi(createMatrixIntegrationRoute, async (c) => {
    const { projectId } = c.req.valid("param");
    const body = c.req.valid("json");

    const config = normalizeMatrixConfig({
      homeserverUrl: body.homeserverUrl.trim().replace(/\/+$/, ""),
      accessToken: body.accessToken.trim(),
      mode: body.mode,
      spaceName: body.spaceName?.trim() || undefined,
      parentSpaceId: body.parentSpaceId?.trim() || undefined,
      roomId: body.roomId?.trim() || undefined,
      events: body.events,
    });

    const validation = await validateMatrixConfig(config);
    if (!validation.valid) {
      throw new HTTPException(400, {
        message: validation.errors?.join(", ") ?? "Invalid config",
      });
    }

    const projectName = await requireProjectName(projectId);

    let client;
    try {
      client = await createMatrixClient({
        homeserverUrl: config.homeserverUrl,
        accessToken: config.accessToken,
      });
    } catch (error) {
      throw homeserverError(error);
    }

    if (config.mode === "provision") {
      try {
        const structure = await provisionMatrixStructure(client, projectName, {
          spaceName: config.spaceName,
          parentSpaceId: config.parentSpaceId,
        });
        config.spaceId = structure.spaceId;
        config.updatesRoomId = structure.updatesRoomId;
        config.generalRoomId = structure.generalRoomId;
        config.botUserId = structure.botUserId;
      } catch (error) {
        throw homeserverError(error);
      }
    } else {
      if (!config.roomId) {
        throw new HTTPException(400, {
          message: "A room ID or alias is required in existing mode",
        });
      }

      try {
        const roomId = config.roomId.startsWith("#")
          ? await client.resolveAlias(config.roomId)
          : config.roomId;
        await client.joinRoom(roomId);
        config.roomId = roomId;
        config.botUserId = await client.whoami();
      } catch (error) {
        throw homeserverError(error);
      }
    }

    const existing = await db.query.integrationTable.findFirst({
      where: and(
        eq(integrationTable.projectId, projectId),
        eq(integrationTable.type, "matrix"),
      ),
    });

    if (existing) {
      await db
        .update(integrationTable)
        .set({
          config: JSON.stringify(config),
          isActive: true,
          updatedAt: new Date(),
        })
        .where(eq(integrationTable.id, existing.id));
    } else {
      await db.insert(integrationTable).values({
        projectId,
        type: "matrix",
        config: JSON.stringify(config),
        isActive: true,
      });
    }

    const integration = await getMatrixIntegration(projectId);
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

    const currentConfig = normalizeMatrixConfig(
      JSON.parse(existing.config) as MatrixConfig,
    );
    const nextConfig = normalizeMatrixConfig({
      ...currentConfig,
      homeserverUrl:
        body.homeserverUrl !== undefined
          ? body.homeserverUrl.trim().replace(/\/+$/, "")
          : currentConfig.homeserverUrl,
      accessToken:
        body.accessToken !== undefined
          ? body.accessToken.trim()
          : currentConfig.accessToken,
      events: {
        ...currentConfig.events,
        ...body.events,
      },
    });

    const validation = await validateMatrixConfig(nextConfig);
    if (!validation.valid) {
      throw new HTTPException(400, {
        message: validation.errors?.join(", ") ?? "Invalid config",
      });
    }

    if (body.homeserverUrl !== undefined || body.accessToken !== undefined) {
      // Re-verify the bot account whenever credentials change.
      try {
        const client = await createMatrixClient({
          homeserverUrl: nextConfig.homeserverUrl,
          accessToken: nextConfig.accessToken,
        });
        nextConfig.botUserId = await client.whoami();
      } catch (error) {
        throw homeserverError(error);
      }
    }

    await db
      .update(integrationTable)
      .set({
        config: JSON.stringify(nextConfig),
        isActive:
          body.isActive !== undefined
            ? body.isActive
            : (existing.isActive ?? true),
        updatedAt: new Date(),
      })
      .where(eq(integrationTable.id, existing.id));

    const integration = await getMatrixIntegration(projectId);
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
    return c.json({ success: true }, 200);
  });

export default matrixIntegration;
