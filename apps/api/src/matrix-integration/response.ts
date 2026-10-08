import { integrationEventsSchema } from "../integrations/response";
import { responseTimestamp, z } from "../openapi";

export const matrixEventsSchema = integrationEventsSchema
  .extend({
    taskDeleted: z.boolean(),
    taskMoved: z.boolean(),
    taskDueDateChanged: z.boolean(),
    taskAssigneeChanged: z.boolean(),
    taskUnassigned: z.boolean(),
  })
  .openapi("MatrixEvents");

// The access token is a bearer credential, so it is never returned; the UI
// only learns whether one is stored.
export const matrixIntegrationSchema = z
  .object({
    id: z.string(),
    projectId: z.string(),
    mode: z.enum(["provision", "existing"]).openapi({
      description:
        "provision means Kaneo created the project space and rooms; existing posts to a room you manage.",
    }),
    homeserverUrl: z.string(),
    tokenConfigured: z.boolean().openapi({
      description: "True when an access token is stored.",
    }),
    botUserId: z.string().nullable(),
    spaceId: z.string().nullable(),
    spaceName: z.string().nullable(),
    parentSpaceId: z.string().nullable(),
    updatesRoomId: z.string().nullable(),
    generalRoomId: z.string().nullable(),
    roomId: z.string().nullable(),
    events: matrixEventsSchema,
    isActive: z.boolean().nullable(),
    createdAt: responseTimestamp,
    updatedAt: responseTimestamp,
  })
  .openapi("MatrixIntegration");
