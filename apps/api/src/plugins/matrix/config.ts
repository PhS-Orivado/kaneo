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

export const matrixEventsSchema = v.object(
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
  v.regex(/^https?:\/\/[^\s]+$/, "Enter a valid Matrix homeserver URL"),
);

const matrixAccessTokenSchema = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1, "An access token is required"),
);

const matrixRoomSchema = v.pipe(
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
  mode: v.picklist(["provision", "existing"]),
  spaceName: v.optional(v.string()),
  parentSpaceId: v.optional(v.pipe(v.string(), v.trim(), v.minLength(1))),
  roomId: v.optional(matrixRoomSchema),
  // Filled in while connecting. The target structure is fixed afterwards and
  // can only change by disconnecting and reconnecting.
  spaceId: v.optional(v.string()),
  updatesRoomId: v.optional(v.string()),
  generalRoomId: v.optional(v.string()),
  botUserId: v.optional(v.string()),
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

export function normalizeMatrixConfig(config: MatrixConfig): MatrixConfig {
  return {
    ...config,
    spaceName: config.spaceName?.trim() || undefined,
    parentSpaceId: config.parentSpaceId?.trim() || undefined,
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
