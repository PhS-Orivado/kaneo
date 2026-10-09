import { z } from "../openapi";
import {
  TASK_ATTRIBUTE_COLORS,
  TASK_ATTRIBUTE_DESCRIPTION_MAX_LENGTH,
  TASK_ATTRIBUTE_ICONS,
  TASK_ATTRIBUTE_MAX_POSITION,
  TASK_ATTRIBUTE_NAME_MAX_LENGTH,
} from "./attribute-validation";

export const taskAttributeParam = z.object({ id: z.string() });

export const workspaceIdParam = z.object({ workspaceId: z.string() });

const colorSchema = z.enum(TASK_ATTRIBUTE_COLORS);
const iconSchema = z.enum(TASK_ATTRIBUTE_ICONS);

export const createTaskAttributeBody = z.object({
  workspaceId: z.string(),
  name: z.string().min(1).max(TASK_ATTRIBUTE_NAME_MAX_LENGTH),
  description: z
    .string()
    .max(TASK_ATTRIBUTE_DESCRIPTION_MAX_LENGTH)
    .nullish(),
  icon: iconSchema,
  iconColor: colorSchema,
  textColor: colorSchema,
  isDefault: z.boolean().optional(),
});

export const updateTaskAttributeBody = z.object({
  name: z.string().min(1).max(TASK_ATTRIBUTE_NAME_MAX_LENGTH).optional(),
  description: z
    .string()
    .max(TASK_ATTRIBUTE_DESCRIPTION_MAX_LENGTH)
    .nullish(),
  icon: iconSchema.optional(),
  iconColor: colorSchema.optional(),
  textColor: colorSchema.optional(),
  isDefault: z.boolean().optional(),
});

export const reorderTaskAttributeBody = z.object({
  position: z.number().int().min(0).max(TASK_ATTRIBUTE_MAX_POSITION),
});

export const deleteTaskAttributeQuery = z.object({
  force: z.enum(["true", "false"]).optional(),
});
