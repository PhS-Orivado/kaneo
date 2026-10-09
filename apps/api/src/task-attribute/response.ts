import { responseTimestamp, z } from "../openapi";

export const taskAttributeSchema = z
  .object({
    id: z.string(),
    workspaceId: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    icon: z.string(),
    iconColor: z.string(),
    textColor: z.string(),
    position: z.number().int(),
    isDefault: z.boolean(),
    createdAt: responseTimestamp,
    updatedAt: responseTimestamp,
  })
  .openapi("TaskAttribute");

export const taskAttributeListSchema = z.array(taskAttributeSchema);

// RFC 0002: returned with HTTP 409 when tasks still reference the attribute
// and the caller did not pass force=true.
export const taskAttributeDeleteBlockedSchema = z
  .object({
    message: z.string(),
    referenceCount: z.number().int(),
  })
  .openapi("TaskAttributeDeleteBlocked");
