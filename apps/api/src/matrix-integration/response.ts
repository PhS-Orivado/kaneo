import { integrationEventsSchema } from "../integrations/response";
import { responseTimestamp, z } from "../openapi";

// The access token is a bearer credential, so only a masked form is returned.
export const matrixIntegrationSchema = z
  .object({
    id: z.string(),
    projectId: z.string(),
    homeserverUrl: z.string().openapi({
      description: "Base URL of the Matrix homeserver messages are sent to.",
    }),
    userId: z.string().openapi({
      description: "Full Matrix user ID of the bot account.",
    }),
    spaceNamePrefix: z.string().nullable().openapi({
      description: "Optional prefix for the workspace space name.",
    }),
    inviteUsers: z.array(z.string()).openapi({
      description: "Matrix user IDs invited to every created space and room.",
    }),
    tokenConfigured: z.boolean(),
    maskedAccessToken: z.string(),
    events: integrationEventsSchema,
    isActive: z.boolean().nullable(),
    createdAt: responseTimestamp,
    updatedAt: responseTimestamp,
  })
  .openapi("MatrixIntegration");
