import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { createFileRoute } from "@tanstack/react-router";
import { GripVertical, Pencil, Plus, Shapes, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { TaskAttributeBadge } from "@/components/task-attribute-badge";
import PageTitle from "@/components/page-title";
import { SettingsPage } from "@/components/settings/settings-page";
import { TaskAttributeDialog } from "@/components/settings/task-attribute-dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardDescription,
  CardFrame,
  CardHeader,
  CardPanel,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import type { TaskAttributeDraft } from "@/lib/task-attribute-form";
import {
  TaskAttributeDeleteBlockedError,
} from "@/fetchers/task-attribute/delete-task-attribute";
import useCreateTaskAttribute from "@/hooks/mutations/task-attribute/use-create-task-attribute";
import useDeleteTaskAttribute from "@/hooks/mutations/task-attribute/use-delete-task-attribute";
import useReorderTaskAttribute from "@/hooks/mutations/task-attribute/use-reorder-task-attribute";
import useUpdateTaskAttribute from "@/hooks/mutations/task-attribute/use-update-task-attribute";
import useGetTaskAttributes from "@/hooks/queries/task-attribute/use-get-task-attributes";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { cn } from "@/lib/cn";
import { toast } from "@/lib/toast";
import type TaskAttribute from "@/types/task-attribute";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/settings/workspace/task-attributes",
)({
  component: RouteComponent,
});



function AttributeRow({
  attribute,
  canUpdate,
  canDelete,
  isReorderPending,
  onEdit,
  onDelete,
}: {
  attribute: TaskAttribute;
  canUpdate: boolean;
  canDelete: boolean;
  isReorderPending: boolean;
  onEdit: (attribute: TaskAttribute) => void;
  onDelete: (attribute: TaskAttribute) => void;
}) {
  const { t } = useTranslation();
  const {
    attributes: dragAttributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
      id: attribute.id,
      disabled: !canUpdate,
      // The reorder already moves the row; animating the index change too
      // replays the same move from a stale offset.
      animateLayoutChanges: () => false,
      // dnd-kit defaults to `ease`; this is the app's curve.
      transition: { duration: 200, easing: "var(--ease-out)" },
    });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : undefined,
      }}
      className="flex items-center justify-between gap-2 py-2.5 px-1"
    >
      <div className="flex min-w-0 items-center gap-2.5">
        {canUpdate && (
          <button
            type="button"
            className="flex h-8 w-6 cursor-grab touch-none items-center justify-center text-muted-foreground hover:text-foreground"
            aria-label={t("settings:workspaceTaskAttributes.reorderHandle", {
              defaultValue: `Reorder ${attribute.name}`,
            })}
            disabled={isReorderPending}
            {...dragAttributes}
            {...listeners}
          >
            <GripVertical className="size-4" />
          </button>
        )}
        <div className="min-w-0 space-y-0.5">
          <div className="flex items-center gap-2">
            <TaskAttributeBadge attribute={attribute} />
            {attribute.isDefault && (
              <span className="text-xs text-muted-foreground">
                {t("settings:workspaceTaskAttributes.defaultBadge", {
                  defaultValue: "Default",
                })}
              </span>
            )}
          </div>
          {attribute.description && (
            <p className="truncate text-xs text-muted-foreground">
              {attribute.description}
            </p>
          )}
        </div>
      </div>
      {(canUpdate || canDelete) && (
        <div className="flex shrink-0 items-center gap-1">
          {canUpdate && (
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("settings:workspaceTaskAttributes.editAttribute", {
                defaultValue: "Edit Task Attribute",
              })}
              className="h-8 w-8"
              onClick={() => onEdit(attribute)}
            >
              <Pencil className="size-3.5" />
            </Button>
          )}
          {canDelete && (
            <Button
              variant="ghost"
              size="icon"
              aria-label={t(
                "settings:workspaceTaskAttributes.deleteAttribute",
                { defaultValue: "Delete" },
              )}
              title={
                attribute.isDefault
                  ? t("settings:workspaceTaskAttributes.defaultDeleteHint", {
                      defaultValue:
                        "The default attribute cannot be deleted; set another attribute as the default first",
                    })
                  : undefined
              }
              className={cn(
                "h-8 w-8 text-destructive hover:text-destructive",
                attribute.isDefault && "cursor-not-allowed opacity-50",
              )}
              disabled={attribute.isDefault}
              onClick={() => onDelete(attribute)}
            >
              <Trash2 className="size-3.5" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function RouteComponent() {
  const { t } = useTranslation();
  const {
    workspace,
    canCreateTaskAttributes,
    canUpdateTaskAttributes,
    canDeleteTaskAttributes,
  } = useWorkspacePermission();
  const canCreate = canCreateTaskAttributes();
  const canUpdate = canUpdateTaskAttributes();
  const canDelete = canDeleteTaskAttributes();

  const workspaceId = workspace?.id ?? "";

  const { data: attributes = [] } = useGetTaskAttributes(workspaceId);

  const createAttribute = useCreateTaskAttribute();
  const updateAttribute = useUpdateTaskAttribute();
  const deleteAttribute = useDeleteTaskAttribute();
  const reorderAttribute = useReorderTaskAttribute();

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<TaskAttribute | null>(null);
  const [deleting, setDeleting] = useState<TaskAttribute | null>(null);
  const [blockedCount, setBlockedCount] = useState<number | null>(null);

  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 150, tolerance: 8 },
    }),
  );

  const toDraft = (attribute: TaskAttribute): TaskAttributeDraft => ({
    name: attribute.name,
    description: attribute.description ?? "",
    icon: attribute.icon,
    iconColor: attribute.iconColor,
    textColor: attribute.textColor,
    isDefault: attribute.isDefault,
  });

  const openEdit = (attribute: TaskAttribute) => setEditing(attribute);

  const handleEdit = async (draft: TaskAttributeDraft) => {
    if (!editing) return;

    try {
      await updateAttribute.mutateAsync({
        id: editing.id,
        name: draft.name,
        description: draft.description || null,
        icon: draft.icon,
        iconColor: draft.iconColor,
        textColor: draft.textColor,
        isDefault: draft.isDefault,
      });
      toast.success(
        t("settings:workspaceTaskAttributes.updateSuccess", {
          defaultValue: "Task attribute updated",
        }),
      );
      setEditing(null);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("settings:workspaceTaskAttributes.updateError", {
              defaultValue: "Failed to update task attribute",
            }),
      );
    }
  };

  const handleCreate = async (draft: TaskAttributeDraft) => {
    try {
      await createAttribute.mutateAsync({
        workspaceId,
        name: draft.name,
        description: draft.description || null,
        icon: draft.icon,
        iconColor: draft.iconColor,
        textColor: draft.textColor,
        isDefault: draft.isDefault,
      });
      toast.success(
        t("settings:workspaceTaskAttributes.createSuccess", {
          defaultValue: "Task attribute created",
        }),
      );
      setCreateOpen(false);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("settings:workspaceTaskAttributes.createError", {
              defaultValue: "Failed to create task attribute",
            }),
      );
    }
  };

  const openDelete = (attribute: TaskAttribute) => {
    setBlockedCount(null);
    setDeleting(attribute);
  };

  const handleDelete = async (force = false) => {
    if (!deleting) return;

    try {
      await deleteAttribute.mutateAsync({ id: deleting.id, force });
      toast.success(
        t("settings:workspaceTaskAttributes.deleteSuccess", {
          defaultValue: "Task attribute deleted",
        }),
      );
      setDeleting(null);
      setBlockedCount(null);
    } catch (error) {
      if (error instanceof TaskAttributeDeleteBlockedError) {
        setBlockedCount(error.referenceCount);
      } else {
        toast.error(
          error instanceof Error
            ? error.message
            : t("settings:workspaceTaskAttributes.deleteError", {
                defaultValue: "Failed to delete task attribute",
              }),
        );
      }
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = attributes.findIndex(
      (attribute) => attribute.id === active.id,
    );
    const newIndex = attributes.findIndex(
      (attribute) => attribute.id === over.id,
    );
    if (oldIndex < 0 || newIndex < 0) return;

    // Renumber the displayed order so positions stay contiguous and the
    // stored order always matches what the administrator sees.
    const reordered = arrayMove(attributes, oldIndex, newIndex);
    const changed = reordered
      .map((attribute, index) => ({ attribute, index }))
      .filter(({ attribute, index }) => attribute.position !== index);
    if (changed.length === 0) return;

    void Promise.all(
      changed.map(({ attribute, index }) =>
        reorderAttribute.mutateAsync({ id: attribute.id, position: index }),
      ),
    ).catch(() => {
      toast.error(
        t("settings:workspaceTaskAttributes.reorderError", {
          defaultValue: "Failed to reorder task attributes",
        }),
      );
    });
  };

  return (
    <>
      <PageTitle title={t("settings:workspaceTaskAttributes.pageTitle")} />
      <SettingsPage
        title={t("settings:workspaceTaskAttributes.title")}
        description={t("settings:workspaceTaskAttributes.subtitle")}
      >
        <CardFrame>
          <Card className="!rounded-none !border-t-0">
            <CardHeader>
              <CardTitle className="inline-flex items-center gap-2 text-base">
                <Shapes className="size-4" />
                {t("settings:workspaceTaskAttributes.title", {
                  defaultValue: "Task Attributes",
                })}
              </CardTitle>
              <CardDescription>
                {t("settings:workspaceTaskAttributes.cardDescription", {
                  defaultValue:
                    "Manage the task attributes (types) that can be assigned to tasks in this workspace.",
                })}
              </CardDescription>
              {canCreate && (
                <CardAction>
                  <Button onClick={() => setCreateOpen(true)} className="gap-2">
                    <Plus className="size-4" />
                    {t("settings:workspaceTaskAttributes.createTitle", {
                      defaultValue: "Create Task Attribute",
                    })}
                  </Button>
                </CardAction>
              )}
            </CardHeader>
          </Card>

          <Card className="!rounded-none">
            <CardPanel className="p-4">
              {attributes.length === 0 ? (
                <Empty>
                  <EmptyHeader>
                    <EmptyMedia>
                      <Shapes className="size-8 text-muted-foreground" />
                    </EmptyMedia>
                    <EmptyTitle>
                      {t("settings:workspaceTaskAttributes.empty", {
                        defaultValue:
                          "No task attributes yet. Create your first task attribute to get started.",
                      })}
                    </EmptyTitle>
                    <EmptyDescription />
                  </EmptyHeader>
                </Empty>
              ) : (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  modifiers={[restrictToVerticalAxis]}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={attributes.map((attribute) => attribute.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="divide-y divide-border">
                      {attributes.map((attribute) => (
                        <AttributeRow
                          key={attribute.id}
                          attribute={attribute}
                          canUpdate={canUpdate}
                          canDelete={canDelete}
                          isReorderPending={reorderAttribute.isPending}
                          onEdit={openEdit}
                          onDelete={openDelete}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              )}
            </CardPanel>
          </Card>
        </CardFrame>
      </SettingsPage>

      <TaskAttributeDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        mode="create"
        isPending={createAttribute.isPending}
        onSubmit={handleCreate}
      />

      <TaskAttributeDialog
        open={Boolean(editing)}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        mode="edit"
        initial={editing ? toDraft(editing) : undefined}
        isCurrentDefault={editing?.isDefault ?? false}
        isPending={updateAttribute.isPending}
        onSubmit={handleEdit}
      />

      <AlertDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => {
          if (!open) {
            setDeleting(null);
            setBlockedCount(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("settings:workspaceTaskAttributes.deleteConfirmTitle", {
                defaultValue: "Delete this task attribute?",
              })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {blockedCount === null
                ? t(
                    "settings:workspaceTaskAttributes.deleteConfirmDescription",
                    {
                      defaultValue:
                        "This action cannot be undone. If tasks still use this attribute, you will be offered to reassign them.",
                    },
                  )
                : t("settings:workspaceTaskAttributes.deleteBlocked", {
                    defaultValue:
                      "{{count}} task(s) still use this attribute. You can reassign them to the workspace default and delete it.",
                    count: blockedCount,
                  })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeleting(null);
                setBlockedCount(null);
              }}
            >
              {t("common:actions.cancel", { defaultValue: "Cancel" })}
            </Button>
            {blockedCount === null ? (
              <Button
                variant="destructive"
                onClick={() => handleDelete(false)}
                disabled={deleteAttribute.isPending}
              >
                {deleteAttribute.isPending
                  ? t("common:actions.deleting")
                  : t("settings:workspaceTaskAttributes.deleteAttribute", {
                      defaultValue: "Delete",
                    })}
              </Button>
            ) : (
              <Button
                variant="destructive"
                onClick={() => handleDelete(true)}
                disabled={deleteAttribute.isPending}
              >
                {deleteAttribute.isPending
                  ? t("common:actions.deleting")
                  : t("settings:workspaceTaskAttributes.deleteForce", {
                      defaultValue: "Reassign and delete",
                    })}
              </Button>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
