import type { MatrixClient } from "./client";

export type MatrixProvisionResult = {
  spaceId: string;
  updatesRoomId: string;
  generalRoomId: string;
  botUserId: string;
};

export type MatrixProvisionOptions = {
  spaceName?: string;
  parentSpaceId?: string;
};

// Creates the full Matrix structure for a project: a space with an Updates
// room for notifications and a General room for discussion. When a parent
// space is given, the project space is linked as a subspace of it.
export async function provisionMatrixStructure(
  client: MatrixClient,
  projectName: string,
  options: MatrixProvisionOptions,
): Promise<MatrixProvisionResult> {
  const botUserId = await client.whoami();

  let parentSpaceId: string | undefined;
  if (options.parentSpaceId) {
    parentSpaceId = options.parentSpaceId.startsWith("#")
      ? await client.resolveAlias(options.parentSpaceId)
      : options.parentSpaceId;
  }

  const spaceId = await client.createRoom({
    name: options.spaceName?.trim() || "Kaneo \u00b7 " + projectName,
    topic: "Kaneo project notifications for " + projectName,
    isSpace: true,
  });

  const roomPowerLevels = {
    invite: 0,
    users_default: 0,
    events_default: 0,
  };

  const updatesRoomId = await client.createRoom({
    name: "Updates",
    topic: "Task notifications from Kaneo",
    powerLevelContentOverride: roomPowerLevels,
  });
  const generalRoomId = await client.createRoom({
    name: "General",
    topic: "General discussion for " + projectName,
    powerLevelContentOverride: roomPowerLevels,
  });

  const via = [client.homeserverName];

  // Space -> child links put the rooms inside the space in Element.
  await client.sendStateEvent(spaceId, "m.space.child", updatesRoomId, {
    via,
    suggested: true,
    order: "01",
  });
  await client.sendStateEvent(spaceId, "m.space.child", generalRoomId, {
    via,
    order: "02",
  });

  // Child -> parent backlinks make the nesting canonical for clients that
  // only read m.space.parent.
  await client.sendStateEvent(updatesRoomId, "m.space.parent", spaceId, {
    via,
    canonical: true,
  });
  await client.sendStateEvent(generalRoomId, "m.space.parent", spaceId, {
    via,
    canonical: true,
  });

  if (parentSpaceId) {
    await client.sendStateEvent(parentSpaceId, "m.space.child", spaceId, {
      via,
    });
    await client.sendStateEvent(spaceId, "m.space.parent", parentSpaceId, {
      via,
      canonical: true,
    });
  }

  await client.sendNotice(
    updatesRoomId,
    "Kaneo connected. Task updates for " +
      projectName +
      " will be posted in this room.",
    "Kaneo connected. Task updates for <strong>" +
      escapeHtml(projectName) +
      "</strong> will be posted in this room.",
  );

  return {
    spaceId,
    updatesRoomId,
    generalRoomId,
    botUserId,
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
