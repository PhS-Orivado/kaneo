import { Check, Minus, Search } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import taskAttributeIcons, {
  type TaskAttributeIconName,
} from "@/constants/task-attribute-icons";
import { useSetTaskAttribute } from "@/hooks/mutations/task-attribute/use-set-task-attribute";
import useGetTaskAttributes from "@/hooks/queries/task-attribute/use-get-task-attributes";
import useActiveWorkspace from "@/hooks/queries/workspace/use-active-workspace";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { resolveTaskAttributeColor } from "@/lib/task-attribute-color";
import { toast } from "@/lib/toast";
import type Task from "@/types/task";
import type TaskAttribute from "@/types/task-attribute";

type TaskAttributePopoverProps = {
  task: Task;
  workspaceId?: string;
  children: React.ReactNode;
};

// RFC 0002: attribute assignment following the priority popover interaction
// model — a None option, a checkmark on the current value, and a search field
// once the workspace defines more than eight attributes.
export default function TaskAttributePopover({
  task,
  workspaceId,
  children,
}: TaskAttributePopoverProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const { data: activeWorkspace } = useActiveWorkspace();
  const resolvedWorkspaceId = workspaceId ?? activeWorkspace?.id ?? "";
  const { data: attributes, isLoading, isError } =
    useGetTaskAttributes(resolvedWorkspaceId);
  const { mutateAsync: setTaskAttribute } = useSetTaskAttribute();
  const { canUpdateTasks } = useWorkspacePermission();
  const canEdit = canUpdateTasks();

  const showSearch = (attributes?.length ?? 0) > 8;

  const filteredAttributes = useMemo(() => {
    const list = attributes ?? [];
    if (!searchValue.trim()) return list;
    const needle = searchValue.trim().toLowerCase();
    return list.filter((attribute) =>
      attribute.name.toLowerCase().includes(needle),
    );
  }, [attributes, searchValue]);

  const handleAttributeChange = useCallback(
    async (attributeId: string | null) => {
      try {
        await setTaskAttribute({
          taskId: task.id,
          attributeId,
          projectId: task.projectId,
        });
        setOpen(false);
        setSearchValue("");
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : t("tasks:popover.attribute.updateError", {
                defaultValue: "Could not update the task attribute",
              }),
        );
      }
    },
    [setTaskAttribute, t, task.id, task.projectId],
  );

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      setOpen(nextOpen);
      if (!nextOpen) setSearchValue("");
    },
    [setOpen],
  );

  // Read-only role: render the trigger child as a plain element so the user
  // still sees the current attribute but can't open the popover.
  if (!canEdit) return <>{children}</>;

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-56 p-0" align="start">
        {showSearch && (
          <div className="flex items-center gap-2 border-b border-border p-2">
            <Search className="size-3 text-muted-foreground" />
            <input
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
              placeholder={t("tasks:popover.attribute.searchPlaceholder", {
                defaultValue: "Search attributes",
              })}
              className="w-full border-none bg-transparent text-xs text-foreground focus:outline-none placeholder:text-muted-foreground"
            />
          </div>
        )}
        <div>
          {isLoading && (
            <span className="block px-2 py-2 text-xs text-muted-foreground">
              {t("common:empty.loading", { defaultValue: "Loading…" })}
            </span>
          )}
          {isError && (
            <span className="block px-2 py-2 text-xs text-muted-foreground">
              {t("common:error.title", {
                defaultValue: "Something went wrong",
              })}
            </span>
          )}
          {!isLoading && !isError && (attributes?.length ?? 0) === 0 && (
            <span className="block px-2 py-2 text-xs text-muted-foreground">
              {t("tasks:popover.attribute.empty", {
                defaultValue: "No attributes defined",
              })}
            </span>
          )}
          {filteredAttributes.map((attribute: TaskAttribute) => {
            const Icon =
              taskAttributeIcons[attribute.icon as TaskAttributeIconName] ??
              taskAttributeIcons.SquareCheckBig;
            const isCurrent = task.attribute?.id === attribute.id;
            return (
              <Button
                key={attribute.id}
                variant="ghost"
                size="sm"
                className="h-8 w-full justify-start gap-2 rounded-none px-2 first:rounded-t-md last:rounded-b-md"
                onClick={() => handleAttributeChange(attribute.id)}
              >
                <Icon
                  aria-hidden
                  className="size-4 shrink-0"
                  style={{
                    color: resolveTaskAttributeColor(attribute.iconColor),
                  }}
                />
                <span
                  className="truncate text-sm"
                  style={{
                    color: resolveTaskAttributeColor(attribute.textColor),
                  }}
                >
                  {attribute.name}
                </span>
                {isCurrent && <Check className="ml-auto size-4" />}
              </Button>
            );
          })}
          {((attributes?.length ?? 0) === 0 || !searchValue.trim()) && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-full justify-start gap-2 rounded-none px-2 last:rounded-b-md"
              onClick={() => handleAttributeChange(null)}
            >
              <Minus aria-hidden className="size-4 shrink-0" />
              <span className="text-sm">
                {t("tasks:popover.attribute.none", { defaultValue: "None" })}
              </span>
              {!task.attribute && <Check className="ml-auto size-4" />}
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
