import { Minus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { DropdownMenuCheckboxItem } from "@/components/ui/menu";
import taskAttributeIcons, {
  type TaskAttributeIconName,
} from "@/constants/task-attribute-icons";
import { resolveTaskAttributeColor } from "@/lib/task-attribute-color";
import type TaskAttribute from "@/types/task-attribute";

// Sentinel id used by every attribute filter facet to represent tasks that
// carry no attribute. It never matches a real attribute id.
export const TASK_ATTRIBUTE_FILTER_NONE = "none";

type TaskAttributeFilterListProps = {
  attributes: TaskAttribute[];
  selectedIds: string[];
  onToggle: (attributeId: string) => void;
  includeNone?: boolean;
};

// RFC 0002: the attribute facet options shared by the board, backlog,
// my-tasks, and search filter surfaces. Selection semantics (single versus
// multi select) stay with the surface; this list only renders and reports.
export default function TaskAttributeFilterList({
  attributes,
  selectedIds,
  onToggle,
  includeNone = true,
}: TaskAttributeFilterListProps) {
  const { t } = useTranslation();

  return (
    <>
      {attributes.map((attribute) => {
        const Icon =
          taskAttributeIcons[attribute.icon as TaskAttributeIconName] ??
          taskAttributeIcons.SquareCheckBig;
        return (
          <DropdownMenuCheckboxItem
            key={attribute.id}
            checked={selectedIds.includes(attribute.id)}
            onCheckedChange={() => onToggle(attribute.id)}
            closeOnClick
            className="h-8 rounded-md text-sm"
          >
            <Icon
              aria-hidden
              style={{
                color: resolveTaskAttributeColor(attribute.iconColor),
              }}
            />
            <span
              style={{
                color: resolveTaskAttributeColor(attribute.textColor),
              }}
            >
              {attribute.name}
            </span>
          </DropdownMenuCheckboxItem>
        );
      })}
      {includeNone && (
        <DropdownMenuCheckboxItem
          checked={selectedIds.includes(TASK_ATTRIBUTE_FILTER_NONE)}
          onCheckedChange={() => onToggle(TASK_ATTRIBUTE_FILTER_NONE)}
          closeOnClick
          className="h-8 rounded-md text-sm [&_svg]:text-muted-foreground"
        >
          <Minus aria-hidden />
          <span>
            {t("tasks:boardFilters.noType", { defaultValue: "No type" })}
          </span>
        </DropdownMenuCheckboxItem>
      )}
    </>
  );
}
