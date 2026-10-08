import * as v from "valibot";

export const matrixEventKeys = [
  "taskCreated",
  "taskStatusChanged",
  "taskPriorityChanged",
  "taskTitleChanged",
  "taskDescriptionChanged",
  "taskCommentCreated",
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
  v.regex(/^https?:\/\/[^\s]+$/, "Enter a valid homeserver URL"),
);

const matrixUserIdSchema = v.pipe(
  v.string(),
  v.trim(),
  v.regex(/^@[^:\s]+:\S+$/, "Enter a valid Matrix user ID"),
);

const matrixAccessTokenSchema = v.pipe(
  v.string(),
  v.minLength(1, "Access token is required"),
);

const matrixInviteUsersSchema = v.pipe(
  v.array(v.pipe(v.string(), v.trim(), v.minLength(1))),
  v.maxLength(50),
);

export const matrixConfigSchema = v.object({
  homeserverUrl: matrixHomeserverUrlSchema,
  userId: matrixUserIdSchema,
  accessToken: matrixAccessTokenSchema,
  spaceNamePrefix: v.optional(v.string()),
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
};

export function normalizeHomeserverUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

export function normalizeMatrixConfig(config: MatrixConfig): MatrixConfig {
  return {
    ...config,
    homeserverUrl: normalizeHomeserverUrl(config.homeserverUrl),
    userId: config.userId.trim(),
    spaceNamePrefix: config.spaceNamePrefix?.trim() || undefined,
    inviteUsers: Array.isArray(config.inviteUsers)
      ? config.inviteUsers.map((user) => user.trim()).filter(Boolean)
      : undefined,
    events: {
      ...defaultMatrixEvents,
      ...config.events,
    },
  };
}

export function validateMatrixConfig(config: unknown): {
  valid: boolean;
  errors?: string[];
} {
  try {
    const parsed = v.parse(matrixConfigSchema, config);
    normalizeMatrixConfig(parsed);
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
