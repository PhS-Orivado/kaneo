import {
  createMatrixRoom,
  isMatrixRoomInUseError,
  linkSpaceChild,
  linkSpaceParent,
  MatrixRequestError,
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

export function projectGeneralRoomAlias(
  projectId: string,
  serverName: string,
): string {
  return `#kaneo-project-${projectId}-general:${serverName}`;
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

// Members of a provisioned room can invite and post without waiting for the
// bot to raise their power level first.
const roomPowerLevels = {
  invite: 0,
  users_default: 0,
  events_default: 0,
};

async function resolveOrCreateRoom(
  config: MatrixConfig,
  options: {
    alias: string;
    aliasLocalpart: string;
    name: string;
    isSpace?: boolean;
    isRoom?: boolean;
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
        ...(options.isRoom ? { powerLevelContentOverride: roomPowerLevels } : {}),
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

async function resolveParentSpaceId(
  config: MatrixConfig,
): Promise<string | undefined> {
  const parentSpaceId = config.parentSpaceId?.trim();
  if (!parentSpaceId) {
    return undefined;
  }

  if (parentSpaceId.startsWith("#")) {
    const resolved = await resolveRoomAlias(
      config.homeserverUrl,
      config.accessToken,
      parentSpaceId,
    );

    if (!resolved) {
      throw new MatrixRequestError("response");
    }

    return resolved;
  }

  return parentSpaceId;
}

async function trySpaceLink(
  label: string,
  context: { workspaceId: string; projectId: string },
  link: () => Promise<void>,
): Promise<void> {
  try {
    await link();
  } catch (error) {
    console.error(`ensureMatrixStructure ${label} failed`, {
      error: safeMatrixError(error),
      workspaceId: context.workspaceId,
      projectId: context.projectId,
    });
  }
}

export type MatrixStructure = {
  workspaceId: string;
  workspaceName: string;
  projectId: string;
  projectName: string;
  spaceId: string;
  subspaceId: string;
  roomId: string;
  generalRoomId: string;
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
  const context = {
    workspaceId: data.workspaceId,
    projectId: data.projectId,
  };

  const parentSpaceId = await resolveParentSpaceId(config);

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
    isRoom: true,
  });

  const generalRoomAlias = projectGeneralRoomAlias(data.projectId, serverName);
  const generalRoomId = await resolveOrCreateRoom(config, {
    alias: generalRoomAlias,
    aliasLocalpart: `kaneo-project-${data.projectId}-general`,
    name: `${data.projectName} — General`,
    isRoom: true,
  });

  const order = spaceOrderForProject(data.projectName);

  // Hierarchy links are cosmetic; a failure never blocks the message delivery.
  await trySpaceLink("space link", context, () =>
    linkSpaceChild(
      config.homeserverUrl,
      config.accessToken,
      spaceId,
      subspaceId,
      { order },
    ),
  );

  await trySpaceLink("room link", context, () =>
    linkSpaceChild(
      config.homeserverUrl,
      config.accessToken,
      subspaceId,
      roomId,
      { suggested: true, order: "01" },
    ),
  );

  await trySpaceLink("general room link", context, () =>
    linkSpaceChild(
      config.homeserverUrl,
      config.accessToken,
      subspaceId,
      generalRoomId,
      { order: "02" },
    ),
  );

  // Child -> parent backlinks make the nesting canonical for clients that
  // only read m.space.parent.
  await trySpaceLink("subspace backlink", context, () =>
    linkSpaceParent(
      config.homeserverUrl,
      config.accessToken,
      subspaceId,
      spaceId,
      { canonical: true },
    ),
  );

  await trySpaceLink("room backlink", context, () =>
    linkSpaceParent(
      config.homeserverUrl,
      config.accessToken,
      roomId,
      subspaceId,
      { canonical: true },
    ),
  );

  await trySpaceLink("general room backlink", context, () =>
    linkSpaceParent(
      config.homeserverUrl,
      config.accessToken,
      generalRoomId,
      subspaceId,
      { canonical: true },
    ),
  );

  if (parentSpaceId) {
    await trySpaceLink("parent space link", context, () =>
      linkSpaceChild(
        config.homeserverUrl,
        config.accessToken,
        parentSpaceId,
        spaceId,
      ),
    );

    await trySpaceLink("parent space backlink", context, () =>
      linkSpaceParent(
        config.homeserverUrl,
        config.accessToken,
        spaceId,
        parentSpaceId,
        { canonical: true },
      ),
    );
  }

  return {
    workspaceId: data.workspaceId,
    workspaceName: data.workspaceName,
    projectId: data.projectId,
    projectName: data.projectName,
    spaceId,
    subspaceId,
    roomId,
    generalRoomId,
  };
}
