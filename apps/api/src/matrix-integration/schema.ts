import { integrationEventToggles } from "../integrations/schema";
import { z } from "../openapi";

export const createMatrixBody = z.object({
  homeserverUrl: z.string().min(1).openapi({
    description:
      "Base URL of the Matrix homeserver, for example https://matrix.example.com.",
  }),
  accessToken: z.string().min(1).openapi({
    description:
      "Access token for the bot account. The bot user ID is discovered from the homeserver during the request.",
  }),
  mode: z.enum(["provision", "existing"]).openapi({
    description:
      "provision creates a space structure on the homeserver; existing joins and posts to a room you manage.",
  }),
  spaceNamePrefix: z.string().optional().openapi({
    description:
      "Optional prefix for the workspace space name in provision mode.",
  }),
  parentSpaceId: z.string().optional().openapi({
    description:
      "Optional room ID or alias of a space the workspace space is nested under (provision mode).",
  }),
  roomId: z.string().optional().openapi({
    description:
      "Room ID (!...) or alias (#...) Kaneo joins and posts to; required in existing mode.",
  }),
  inviteUsers: z.array(z.string()).optional().openapi({
    description:
      "Matrix user IDs invited to every created space and room (provision mode).",
  }),
  events: integrationEventToggles.optional(),
});

// Must match MatrixIntegrationPatchBody in controllers/matrix-controller.
// The connected mode, parent space, and target room are fixed at connect
// time; they can only change by disconnecting and reconnecting.
export const updateMatrixBody = z.object({
  homeserverUrl: z.string().optional(),
  accessToken: z.string().optional(),
  spaceNamePrefix: z.string().nullable().optional(),
  inviteUsers: z.array(z.string()).nullable().optional(),
  isActive: z.boolean().optional(),
  events: integrationEventToggles.optional(),
});
