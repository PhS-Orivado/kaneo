import { SquareCheckBig } from "lucide-react";
import taskAttributeIcons, {
  type TaskAttributeIconName,
} from "@/constants/task-attribute-icons";
import { cn } from "@/lib/cn";
import { resolveTaskAttributeColor } from "@/lib/task-attribute-color";
import type { TaskAttributeRef } from "@/types/task-attribute";

// RFC 0002: the shared rendering contract for task attributes across every
// surface. The symbol renders in the symbol color, the name in the font
// color; both are resolved through theme-aware palette tokens.
export function TaskAttributeBadge({
  attribute,
  className,
}: {
  attribute: TaskAttributeRef | null | undefined;
  className?: string;
}) {
  if (!attribute) return null;

  const Icon =
    taskAttributeIcons[attribute.icon as TaskAttributeIconName] ??
    SquareCheckBig;

  return (
    <span
      title={attribute.name}
      className={cn(
        "inline-flex max-w-40 shrink-0 items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium",
        className,
      )}
      style={{ color: resolveTaskAttributeColor(attribute.textColor) }}
    >
      <Icon
        aria-hidden
        className="size-3 shrink-0"
        style={{ color: resolveTaskAttributeColor(attribute.iconColor) }}
      />
      <span className="truncate">{attribute.name}</span>
    </span>
  );
}
