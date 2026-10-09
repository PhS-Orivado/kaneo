import { Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { TaskAttributeBadge } from "@/components/task-attribute-badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import taskAttributeColors from "@/constants/task-attribute-colors";
import taskAttributeIcons from "@/constants/task-attribute-icons";
import {
  hasTaskAttributeDraftErrors,
  TASK_ATTRIBUTE_DESCRIPTION_MAX_LENGTH,
  TASK_ATTRIBUTE_NAME_MAX_LENGTH,
  validateTaskAttributeDraft,
  type TaskAttributeDraft,
  type TaskAttributeDraftErrors,
} from "@/lib/task-attribute-form";
import { cn } from "@/lib/cn";

export type TaskAttributeDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  initial?: TaskAttributeDraft;
  /** The attribute being edited is already the workspace default. */
  isCurrentDefault?: boolean;
  isPending: boolean;
  onSubmit: (draft: TaskAttributeDraft) => void;
};

const DEFAULT_DRAFT: TaskAttributeDraft = {
  name: "",
  description: "",
  icon: "SquareCheckBig",
  iconColor: "slate",
  textColor: "slate",
  isDefault: false,
};

function ColorSwatches({
  value,
  onChange,
  label,
  groupId,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  groupId: string;
}) {
  return (
    <div className="space-y-2">
      <Label id={groupId}>{label}</Label>
      <div
        role="group"
        aria-labelledby={groupId}
        className="flex flex-wrap gap-2"
      >
        {taskAttributeColors.map((c) => (
          <button
            key={c.value}
            type="button"
            title={c.label}
            aria-label={c.label}
            aria-pressed={value === c.value}
            className={cn(
              "w-8 h-8 rounded-full border-2 transition-[scale,border-color]",
              value === c.value
                ? "border-foreground scale-110"
                : "border-transparent hover:scale-110",
            )}
            style={{ backgroundColor: c.color }}
            onClick={() => onChange(c.value)}
          />
        ))}
      </div>
    </div>
  );
}

export function TaskAttributeDialog({
  open,
  onOpenChange,
  mode,
  initial,
  isCurrentDefault = false,
  isPending,
  onSubmit,
}: TaskAttributeDialogProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<TaskAttributeDraft>(
    initial ?? DEFAULT_DRAFT,
  );
  const [iconSearch, setIconSearch] = useState("");
  const [errors, setErrors] = useState<TaskAttributeDraftErrors>({});

  useEffect(() => {
    if (open) {
      setDraft(initial ?? DEFAULT_DRAFT);
      setIconSearch("");
      setErrors({});
    }
  }, [open, initial]);

  const iconEntries = useMemo(
    () =>
      Object.entries(taskAttributeIcons).filter(([name]) =>
        !iconSearch.trim()
          ? true
          : name.toLowerCase().includes(iconSearch.toLowerCase()),
      ),
    [iconSearch],
  );

  const update = (patch: Partial<TaskAttributeDraft>) =>
    setDraft((current) => ({ ...current, ...patch }));

  const handleSubmit = () => {
    const validation = validateTaskAttributeDraft(draft);
    setErrors(validation);
    if (hasTaskAttributeDraftErrors(validation)) return;
    onSubmit({
      ...draft,
      name: draft.name.trim(),
      description: draft.description.trim(),
    });
  };

  const nameError =
    errors.name === "required"
      ? t("settings:workspaceTaskAttributes.nameRequired", {
          defaultValue: "Attribute name is required",
        })
      : errors.name === "tooLong"
        ? t("settings:workspaceTaskAttributes.nameTooLong", {
            defaultValue: `Name must be at most ${TASK_ATTRIBUTE_NAME_MAX_LENGTH} characters`,
          })
        : undefined;

  const descriptionError =
    errors.description === "tooLong"
      ? t("settings:workspaceTaskAttributes.descriptionTooLong", {
          defaultValue: `Description must be at most ${TASK_ATTRIBUTE_DESCRIPTION_MAX_LENGTH} characters`,
        })
      : undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === "create"
              ? t("settings:workspaceTaskAttributes.createTitle", {
                  defaultValue: "Create Task Attribute",
                })
              : t("settings:workspaceTaskAttributes.editTitle", {
                  defaultValue: "Edit Task Attribute",
                })}
          </DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? t("settings:workspaceTaskAttributes.createDescription", {
                  defaultValue:
                    "Define a new task attribute (type) for this workspace.",
                })
              : t("settings:workspaceTaskAttributes.editDescription", {
                  defaultValue: "Update this task attribute.",
                })}
          </DialogDescription>
        </DialogHeader>

        <div className="p-6 pt-1 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="task-attribute-name">
              {t("settings:workspaceTaskAttributes.nameLabel", {
                defaultValue: "Attribute name",
              })}
            </Label>
            <Input
              id="task-attribute-name"
              value={draft.name}
              maxLength={TASK_ATTRIBUTE_NAME_MAX_LENGTH}
              onChange={(e) => {
                update({ name: e.target.value });
                setErrors({});
              }}
              placeholder={t(
                "settings:workspaceTaskAttributes.namePlaceholder",
                { defaultValue: "Enter attribute name" },
              )}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !isPending) handleSubmit();
              }}
            />
            {nameError && (
              <p className="text-sm text-destructive">{nameError}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="task-attribute-description">
              {t("settings:workspaceTaskAttributes.descriptionLabel", {
                defaultValue: "Description",
              })}
            </Label>
            <Textarea
              id="task-attribute-description"
              value={draft.description}
              maxLength={TASK_ATTRIBUTE_DESCRIPTION_MAX_LENGTH}
              onChange={(e) => {
                update({ description: e.target.value });
                setErrors({});
              }}
              placeholder={t(
                "settings:workspaceTaskAttributes.descriptionPlaceholder",
                { defaultValue: "Optional description" },
              )}
            />
            {descriptionError && (
              <p className="text-sm text-destructive">{descriptionError}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="task-attribute-icon-search">
              {t("settings:workspaceTaskAttributes.iconLabel", {
                defaultValue: "Symbol",
              })}
            </Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <Input
                id="task-attribute-icon-search"
                value={iconSearch}
                onChange={(e) => setIconSearch(e.target.value)}
                placeholder={t(
                  "settings:workspaceTaskAttributes.iconSearchPlaceholder",
                  { defaultValue: "Search symbols..." },
                )}
                className="pl-8"
              />
            </div>
            <div className="grid grid-cols-8 gap-1.5">
              {iconEntries.map(([name, Icon]) => (
                <button
                  key={name}
                  type="button"
                  title={name}
                  aria-label={name}
                  aria-pressed={draft.icon === name}
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-md border transition-colors",
                    draft.icon === name
                      ? "border-foreground bg-muted"
                      : "border-transparent hover:bg-muted",
                  )}
                  onClick={() => update({ icon: name })}
                >
                  <Icon className="size-4" />
                </button>
              ))}
            </div>
          </div>

          <ColorSwatches
            groupId="task-attribute-icon-color"
            label={t("settings:workspaceTaskAttributes.iconColorLabel", {
              defaultValue: "Symbol color",
            })}
            value={draft.iconColor}
            onChange={(iconColor) => update({ iconColor })}
          />

          <ColorSwatches
            groupId="task-attribute-text-color"
            label={t("settings:workspaceTaskAttributes.textColorLabel", {
              defaultValue: "Font color",
            })}
            value={draft.textColor}
            onChange={(textColor) => update({ textColor })}
          />

          <div className="flex items-center justify-between rounded-md border p-3">
            <div className="space-y-0.5">
              <Label htmlFor="task-attribute-default">
                {t("settings:workspaceTaskAttributes.defaultLabel", {
                  defaultValue: "Workspace default",
                })}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t("settings:workspaceTaskAttributes.defaultHint", {
                  defaultValue:
                    "New tasks without an attribute use the default.",
                })}
              </p>
            </div>
            <Switch
              id="task-attribute-default"
              checked={draft.isDefault}
              onCheckedChange={(checked) => update({ isDefault: checked })}
              disabled={mode === "edit" && isCurrentDefault}
            />
          </div>

          <div className="space-y-2">
            <Label>
              {t("settings:workspaceTaskAttributes.previewLabel", {
                defaultValue: "Preview",
              })}
            </Label>
            <div className="flex items-center gap-2 rounded-md border p-3">
              <TaskAttributeBadge
                attribute={{
                  id: "preview",
                  name: draft.name.trim() || "Attribute",
                  icon: draft.icon,
                  iconColor: draft.iconColor,
                  textColor: draft.textColor,
                }}
              />
              {draft.description && (
                <span className="text-xs text-muted-foreground truncate">
                  {draft.description}
                </span>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common:actions.cancel", { defaultValue: "Cancel" })}
          </Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {mode === "create"
              ? t("settings:workspaceTaskAttributes.createTitle", {
                  defaultValue: "Create Task Attribute",
                })
              : t("common:actions.save", { defaultValue: "Save" })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
