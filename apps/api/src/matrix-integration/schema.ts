import { integrationEventToggles } from "../integrations/schema";
import { z } from "../openapi";

// The Matrix integration covers the full task event set except the
// scheduler-only due date reminder.
export const matrixEventToggles = integrationEventToggles.extend({
  taskDeleted: z.boolean().optional(),
  taskMoved: z.boolean().optional(),
  taskDueDateChanged: z.boolean().optional(),
  taskAssigneeChanged: z.boolean().optional(),
  taskUnassigned: z.boolean().optional(),
});

export const createMatrixBody = z.object({
  homeserverUrl: z.string().min(1),
  accessToken: z.string().min(1),
  mode: z.enum(["provision", "existing"]),
  spaceName: z.string().optional(),
  parentSpaceId: z.string().optional(),
  roomId: z.string().optional(),
  events: matrixEventToggles.optional(),
});

export const updateMatrixBody = z.object({
  homeserverUrl: z.string().optional(),
  accessToken: z.string().optional(),
  isActive: z.boolean().optional(),
  events: matrixEventToggles.optional(),
});
