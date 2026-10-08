import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import * as v from "valibot";
import db from "../../database";
import { integrationTable } from "../../database/schema";
import {
  defaultMatrixEvents,
  normalizeMatrixConfig,
  type MatrixConfig,
  type MatrixEventKey,
  matrixConfigSchema,
} from "../../plugins/matrix/config";

// The HTTP body is validated by updateMatrixBody in ../schema; this is the
// shape it produces. Every event toggle is genuinely optional -- a patch merges
// the toggles it carries over the stored ones and leaves the rest alone.
export type MatrixIntegrationPatchBody = {
  homeserverUrl?: string;
  userId?: string;
  accessToken?: string;
  spaceNamePrefix?: string | null;
  inviteUsers?: string[] | null;
  isActive?: boolean;
  events?: Partial<Record<MatrixEventKey, boolean>>;
};

export function buildNextMatrixConfigFromPatch(
  body: MatrixIntegrationPatchBody,
  currentConfig: MatrixConfig,
): MatrixConfig {
  const nextHomeserverUrl =
    "homeserverUrl" in body
      ? (body.homeserverUrl?.trim() ?? "")
      : currentConfig.homeserverUrl;
  const nextUserId =
    "userId" in body ? (body.userId?.trim() ?? "") : currentConfig.userId;
  const nextAccessToken =
    "accessToken" in body
      ? (body.accessToken?.trim() ?? "")
      : currentConfig.accessToken;
  return {
    homeserverUrl: nextHomeserverUrl,
    userId: nextUserId,
    accessToken: nextAccessToken,
    spaceNamePrefix:
      body.spaceNamePrefix === undefined
        ? currentConfig.spaceNamePrefix
        : (body.spaceNamePrefix ?? undefined),
    inviteUsers:
      body.inviteUsers === undefined
        ? currentConfig.inviteUsers
        : (body.inviteUsers ?? undefined),
    events: {
      ...defaultMatrixEvents,
      ...currentConfig.events,
      ...body.events,
    },
  };
}

function maskAccessToken(value: string): string {
  if (value.length > 8) {
    return `${value.slice(0, 4)}…${value.slice(-4)}`;
  }

  return "••••";
}

function sanitizeMatrixConfigForLog(rawConfig: string): string {
  try {
    const parsed = JSON.parse(rawConfig) as Record<string, unknown>;
    for (const key of [
      "accessToken",
      "homeserverUrl",
      "userId",
      "inviteUsers",
      "spaceNamePrefix",
    ] as const) {
      if (key in parsed) {
        parsed[key] = "[REDACTED]";
      }
    }
    return JSON.stringify(parsed);
  } catch {
    return "[UNPARSEABLE]";
  }
}

type MatrixIntegrationRecord = {
  id: string;
  projectId: string;
  config: string;
  isActive: boolean | null;
  createdAt: Date;
  updatedAt: Date;
};

export function parseMatrixIntegrationConfig(
  integration: Pick<MatrixIntegrationRecord, "config" | "id" | "projectId">,
): MatrixConfig {
  try {
    const parsed = v.parse(matrixConfigSchema, JSON.parse(integration.config));
    return normalizeMatrixConfig(parsed);
  } catch (error) {
    console.error("Failed to parse Matrix integration config", {
      error,
      integrationId: integration.id,
      projectId: integration.projectId,
      sanitizedConfig: sanitizeMatrixConfigForLog(integration.config),
    });
    throw new HTTPException(500, {
      message: "Stored Matrix integration configuration is invalid",
    });
  }
}

export function toResponse(integration: MatrixIntegrationRecord) {
  const config = parseMatrixIntegrationConfig(integration);

  return {
    id: integration.id,
    projectId: integration.projectId,
    homeserverUrl: config.homeserverUrl,
    userId: config.userId,
    spaceNamePrefix: config.spaceNamePrefix ?? null,
    inviteUsers: config.inviteUsers ?? [],
    tokenConfigured: Boolean(config.accessToken),
    maskedAccessToken: config.accessToken
      ? maskAccessToken(config.accessToken)
      : "",
    events: {
      ...defaultMatrixEvents,
      ...config.events,
    },
    isActive: integration.isActive,
    createdAt: integration.createdAt,
    updatedAt: integration.updatedAt,
  };
}

export async function getMatrixIntegration(projectId: string) {
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
