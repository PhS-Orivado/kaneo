import { integrationEventToggles } from "../integrations/schema";
import { z } from "../openapi";

export const createMatrixBody = z.object({
  homeserverUrl: z.string().min(1).openapi({
    description:
      "Base URL of the Matrix homeserver, for example https://matrix.example.com.",
  }),
  userId: z.string().min(1).openapi({
    description:
      "Full Matrix user ID of the bot account, for example @kaneo-bot:example.com.",
  }),
  accessToken: z.string().min(1).openapi({
    description: "Access token for the bot account.",
  }),
  spaceNamePrefix: z.string().optional(),
  inviteUsers: z.array(z.string()).optional(),
  events: integrationEventToggles.optional(),
});

// Must match MatrixIntegrationPatchBody in controllers/matrix-controller.
export const updateMatrixBody = z.object({
  homeserverUrl: z.string().optional(),
  userId: z.string().optional(),
  accessToken: z.string().optional(),
  spaceNamePrefix: z.string().nullable().optional(),
  inviteUsers: z.array(z.string()).nullable().optional(),
  isActive: z.boolean().optional(),
  events: integrationEventToggles.optional(),
});
