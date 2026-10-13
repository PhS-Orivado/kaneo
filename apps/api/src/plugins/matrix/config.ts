import * as v from "valibot";

import { assertPublicDestination } from "../../utils/assert-public-destination";

export const matrixEventKeys = [
  "taskCreated",
  "taskStatusChanged",
  "taskPriorityChanged",
  "taskTitleChanged",
  "taskDescriptionChanged",
  "taskCommentCreated",
  "taskDeleted",
  "taskMoved",
  "taskDueDateChanged",
  "taskAssigneeChanged",
  "taskUnassigned",
] as const;

export type MatrixEventKey = (typeof matrixEventKeys)[number];

const matrixEventsSchema = v.object(
  Object.fromEntries(
    matrixEventKeys.map((key) => [key, v.optional(v.boolean())]),
  ) as Record<
    MatrixEventKey,
    v.OptionalSchema<v.BooleanSchema<undefined>, never>
  >,
);

const matrixHomeserverUrlSchema = v.pipe(
  v.string(),
  v.trim(),
  v.regex(/^https?:\/\/[^\s]+$/, "Enter a valid homeserver URL"),
);

const matrixAccessTokenSchema = v.pipe(
  v.string(),
  v.minLength(1, "Access token is required"),
);

const matrixInviteUsersSchema = v.pipe(
  v.array(v.pipe(v.string(), v.trim(), v.minLength(1))),
  v.maxLength(50),
);

// In existing mode Kaneo posts to a room the caller manages, so the target
// must already be a valid room ID (!...) or room alias (#...).
const matrixRoomReferenceSchema = v.pipe(
  v.string(),
  v.trim(),
  v.check(
    (value) =>
      /^![^:\s]+:[^:\s]+$/.test(value) || /^#[^:\s]+:[^:\s]+$/.test(value),
    "Enter a valid Matrix room ID (!...) or alias (#...)",
  ),
);

export const matrixConfigSchema = v.object({
  homeserverUrl: matrixHomeserverUrlSchema,
  accessToken: matrixAccessTokenSchema,
  // provision means Kaneo creates the space structure on the homeserver;
  // existing means it joins and posts to a room the caller manages.
  mode: v.optional(v.picklist(["provision", "existing"])),
  spaceNamePrefix: v.optional(v.string()),
  parentSpaceId: v.optional(v.pipe(v.string(), v.trim(), v.minLength(1))),
  roomId: v.optional(matrixRoomReferenceSchema),
  // Filled in while connecting. The target structure is fixed afterwards and
  // can only change by disconnecting and reconnecting.
  spaceId: v.optional(v.string()),
  updatesRoomId: v.optional(v.string()),
  generalRoomId: v.optional(v.string()),
  botUserId: v.optional(v.string()),
  inviteUsers: v.optional(matrixInviteUsersSchema),
  events: v.optional(matrixEventsSchema),
});

export type MatrixConfig = v.InferOutput<typeof matrixConfigSchema>;

export const defaultMatrixEvents: Record<MatrixEventKey, boolean> = {
  taskCreated: true,
  taskStatusChanged: true,
  taskPriorityChanged: false,
  taskTitleChanged: false,
  taskDescriptionChanged: false,
  taskCommentCreated: true,
  taskDeleted: true,
  taskMoved: true,
  taskDueDateChanged: true,
  taskAssigneeChanged: true,
  taskUnassigned: false,
};

export function normalizeHomeserverUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

export function normalizeMatrixConfig(config: MatrixConfig): MatrixConfig {
  return {
    ...config,
    homeserverUrl: normalizeHomeserverUrl(config.homeserverUrl),
    mode: config.mode ?? "provision",
    spaceNamePrefix: config.spaceNamePrefix?.trim() || undefined,
    parentSpaceId: config.parentSpaceId?.trim() || undefined,
    roomId: config.roomId?.trim() || undefined,
    inviteUsers: Array.isArray(config.inviteUsers)
      ? config.inviteUsers.map((user) => user.trim()).filter(Boolean)
      : undefined,
    events: {
      ...defaultMatrixEvents,
      ...config.events,
    },
  };
}

export async function validateMatrixConfig(
  config: unknown,
): Promise<{ valid: boolean; errors?: string[] }> {
  try {
    const parsed = v.parse(matrixConfigSchema, config);
    await assertPublicDestination(parsed.homeserverUrl, "Matrix homeserver");
    return { valid: true };
  } catch (error) {
    if (error instanceof v.ValiError) {
      return {
        valid: false,
        errors: error.issues.map((issue) => issue.message),
      };
    }

    return {
      valid: false,
      errors: [error instanceof Error ? error.message : "Invalid config"],
    };
  }
}
