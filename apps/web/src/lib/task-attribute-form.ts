import taskAttributeColors from "@/constants/task-attribute-colors";
import taskAttributeIcons, {
  type TaskAttributeIconName,
} from "@/constants/task-attribute-icons";

// RFC 0002: client-side validation for the task attribute create and edit
// dialog. The limits mirror the API zod schemas so the user gets feedback
// before a request is made; the server remains the source of truth.

export const TASK_ATTRIBUTE_NAME_MAX_LENGTH = 64;
export const TASK_ATTRIBUTE_DESCRIPTION_MAX_LENGTH = 256;

export type TaskAttributeDraft = {
  name: string;
  description: string;
  icon: string;
  iconColor: string;
  textColor: string;
  isDefault: boolean;
};

export type TaskAttributeDraftErrors = {
  name?: "required" | "tooLong";
  description?: "tooLong";
  icon?: "invalid";
  iconColor?: "invalid";
  textColor?: "invalid";
};

const COLOR_VALUES = new Set(
  taskAttributeColors.map((color) => color.value as string),
);
const ICON_NAMES = new Set(Object.keys(taskAttributeIcons) as string[]);

export function validateTaskAttributeDraft(
  draft: TaskAttributeDraft,
): TaskAttributeDraftErrors {
  const errors: TaskAttributeDraftErrors = {};
  const name = draft.name.trim();

  if (!name) {
    errors.name = "required";
  } else if (name.length > TASK_ATTRIBUTE_NAME_MAX_LENGTH) {
    errors.name = "tooLong";
  }

  if (draft.description.length > TASK_ATTRIBUTE_DESCRIPTION_MAX_LENGTH) {
    errors.description = "tooLong";
  }

  if (!ICON_NAMES.has(draft.icon as TaskAttributeIconName)) {
    errors.icon = "invalid";
  }

  if (!COLOR_VALUES.has(draft.iconColor)) {
    errors.iconColor = "invalid";
  }

  if (!COLOR_VALUES.has(draft.textColor)) {
    errors.textColor = "invalid";
  }

  return errors;
}

export function hasTaskAttributeDraftErrors(
  errors: TaskAttributeDraftErrors,
): boolean {
  return Object.values(errors).some(Boolean);
}
