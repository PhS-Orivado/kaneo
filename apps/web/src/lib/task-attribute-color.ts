import taskAttributeColors from "@/constants/task-attribute-colors";

const FALLBACK_TASK_ATTRIBUTE_COLOR = "var(--color-neutral-400)";
const HEX_COLOR = /^#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i;

export function resolveTaskAttributeColor(value: string): string {
  const mapped = taskAttributeColors.find((color) => color.value === value)
    ?.color;
  if (mapped) return mapped;

  if (HEX_COLOR.test(value)) return value;

  if (typeof CSS !== "undefined" && CSS.supports?.("color", value)) {
    return value;
  }

  return FALLBACK_TASK_ATTRIBUTE_COLOR;
}

export { FALLBACK_TASK_ATTRIBUTE_COLOR };
