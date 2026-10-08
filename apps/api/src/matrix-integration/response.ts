import { integrationEventsSchema } from "../integrations/response";
import { responseTimestamp, z } from "../openapi";

// The access token is a bearer credential, so only a masked form is returned.
export const matrixIntegrationSchema = z
  .object({
    id: z.string(),
    projectId: z.string(),
    mode: z.enum(["provision", "existing"]).openapi({
      description:
        "provision means Kaneo created the space structure on the homeserver; existing posts to a room you manage.",
    }),
    homeserverUrl: z.string().openapi({
      description: "Base URL of the Matrix homeserver messages are sent to.",
    }),
    botUserId: z.string().nullable().openapi({
      description:
        "Matrix user ID of the bot account, discovered from the homeserver at connect time.",
    }),
    spaceNamePrefix: z.string().nullable().openapi({
      description: "Optional prefix for the workspace space name.",
    }),
    inviteUsers: z.array(z.string()).openapi({
      description: "Matrix user IDs invited to every created space and room.",
    }),
    parentSpaceId: z.string().nullable().openapi({
      description:
        "Room ID or alias of the space the workspace space is nested under.",
    }),
    spaceId: z.string().nullable().openapi({
      description: "Room ID of the provisioned workspace space.",
    }),
    updatesRoomId: z.string().nullable().openapi({
      description: "Room ID task notifications are posted to.",
    }),
    generalRoomId: z.string().nullable().openapi({
      description: "Room ID of the provisioned General discussion room.",
    }),
    roomId: z.string().nullable().openapi({
      description:
        "Target room in existing mode, after alias resolution at connect time.",
    }),
    tokenConfigured: z.boolean(),
    maskedAccessToken: z.string(),
    events: integrationEventsSchema,
    isActive: z.boolean().nullable(),
    createdAt: responseTimestamp,
    updatedAt: responseTimestamp,
  })
  .openapi("MatrixIntegration");
