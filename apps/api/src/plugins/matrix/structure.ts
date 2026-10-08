import {
  createMatrixRoom,
  isMatrixRoomInUseError,
  linkSpaceChild,
  resolveRoomAlias,
  safeMatrixError,
  serverNameFromHomeserverUrl,
} from "./client";
import type { MatrixConfig } from "./config";

// Stable aliases make the structure idempotent: the same workspace and project
// always resolve to the same rooms, no matter how often the events fire.
export function workspaceSpaceAlias(
  workspaceId: string,
  serverName: string,
): string {
  return `#kaneo-ws-${workspaceId}:${serverName}`;
}

export function projectSubspaceAlias(
  projectId: string,
  serverName: string,
): string {
  return `#kaneo-project-${projectId}:${serverName}`;
}

export function projectRoomAlias(
  projectId: string,
  serverName: string,
): string {
  return `#kaneo-project-${projectId}-updates:${serverName}`;
}

// Suggested ordering inside a space so projects sort predictably.
export function spaceOrderForProject(projectName: string): string {
  const base = projectName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return base || "project";
}

async function resolveOrCreateRoom(
  config: MatrixConfig,
  options: {
    alias: string;
    aliasLocalpart: string;
    name: string;
    isSpace?: boolean;
  },
): Promise<string> {
  const existingRoomId = await resolveRoomAlias(
    config.homeserverUrl,
    config.accessToken,
    options.alias,
  );

  if (existingRoomId) {
    return existingRoomId;
  }

  try {
    const room = await createMatrixRoom(
      config.homeserverUrl,
      config.accessToken,
      {
        name: options.name,
        aliasLocalpart: options.aliasLocalpart,
        isSpace: options.isSpace,
        inviteUsers: config.inviteUsers,
      },
    );
    return room.roomId;
  } catch (error) {
    // Another request may have created the room between the alias lookup and
    // the create call; re-resolve instead of failing the notification.
    if (isMatrixRoomInUseError(error)) {
      const racedRoomId = await resolveRoomAlias(
        config.homeserverUrl,
        config.accessToken,
        options.alias,
      );
      if (racedRoomId) {
        return racedRoomId;
      }
    }
    throw error;
  }
}

export type MatrixStructure = {
  workspaceId: string;
  workspaceName: string;
  projectId: string;
  projectName: string;
  roomId: string;
};

export async function ensureMatrixStructure(
  config: MatrixConfig,
  data: {
    workspaceId: string;
    workspaceName: string;
    projectId: string;
    projectName: string;
  },
): Promise<MatrixStructure> {
  const serverName = serverNameFromHomeserverUrl(config.homeserverUrl);
  const spaceNamePrefix = config.spaceNamePrefix?.trim() || "Kaneo";

  const spaceAlias = workspaceSpaceAlias(data.workspaceId, serverName);
  const spaceId = await resolveOrCreateRoom(config, {
    alias: spaceAlias,
    aliasLocalpart: `kaneo-ws-${data.workspaceId}`,
    name: `${spaceNamePrefix} · ${data.workspaceName}`,
    isSpace: true,
  });

  const subspaceAlias = projectSubspaceAlias(data.projectId, serverName);
  const subspaceId = await resolveOrCreateRoom(config, {
    alias: subspaceAlias,
    aliasLocalpart: `kaneo-project-${data.projectId}`,
    name: data.projectName,
    isSpace: true,
  });

  const roomAlias = projectRoomAlias(data.projectId, serverName);
  const roomId = await resolveOrCreateRoom(config, {
    alias: roomAlias,
    aliasLocalpart: `kaneo-project-${data.projectId}-updates`,
    name: `${data.projectName} — Updates`,
  });

  const order = spaceOrderForProject(data.projectName);

  // Hierarchy links are cosmetic; a failure never blocks the message delivery.
  try {
    await linkSpaceChild(
      config.homeserverUrl,
      config.accessToken,
      spaceId,
      subspaceId,
      { order },
    );
  } catch (error) {
    console.error("ensureMatrixStructure space link failed", {
      error: safeMatrixError(error),
      workspaceId: data.workspaceId,
      projectId: data.projectId,
    });
  }

  try {
    await linkSpaceChild(
      config.homeserverUrl,
      config.accessToken,
      subspaceId,
      roomId,
      { suggested: true },
    );
  } catch (error) {
    console.error("ensureMatrixStructure room link failed", {
      error: safeMatrixError(error),
      workspaceId: data.workspaceId,
      projectId: data.projectId,
    });
  }

  return {
    workspaceId: data.workspaceId,
    workspaceName: data.workspaceName,
    projectId: data.projectId,
    projectName: data.projectName,
    roomId,
  };
}
