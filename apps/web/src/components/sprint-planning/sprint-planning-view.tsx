import {
  ChevronDown,
  ChevronUp,
  History,
  Pencil,
  Play,
  Plus,
  Rocket,
  SquareCheckBig,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { formatDateShort } from "@/lib/format";
import { useReorderSprints } from "@/hooks/mutations/sprint/use-reorder-sprints";
import { useStartSprint } from "@/hooks/mutations/sprint/use-start-sprint";
import { useGetSprints } from "@/hooks/queries/sprint/use-get-sprints";
import { toast } from "@/lib/toast";
import type Sprint from "@/types/sprint";
import CloseSprintDialog from "./close-sprint-dialog";
import SprintDialog from "./sprint-dialog";

type SprintPlanningViewProps = {
  projectId: string;
};

function formatSprintRange(sprint: Sprint, t: (key: string) => string) {
  if (!sprint.startDate && !sprint.endDate) {
    return null;
  }
  const start = sprint.startDate
    ? formatDateShort(sprint.startDate)
    : t("tasks:sprints.unscheduled");
  const end = sprint.endDate
    ? formatDateShort(sprint.endDate)
    : t("tasks:sprints.unscheduled");
  return `${start} – ${end}`;
}

// Jira-style sprint planning above the backlog: the single active sprint,
// the reorderable upcoming sprints, and the immutable closed history.
export default function SprintPlanningView({
  projectId,
}: SprintPlanningViewProps) {
  const { t } = useTranslation();
  const { data: sprints = [] } = useGetSprints(projectId);
  const { mutateAsync: startSprint, isPending: isStarting } =
    useStartSprint();
  const { mutateAsync: reorderSprints } = useReorderSprints();

  const [isSprintDialogOpen, setIsSprintDialogOpen] = useState(false);
  const [editedSprint, setEditedSprint] = useState<Sprint | null>(null);
  const [closingSprint, setClosingSprint] = useState<Sprint | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  const activeSprint = sprints.find((sprint) => sprint.status === "active");
  const futureSprints = sprints.filter((sprint) => sprint.status === "future");
  const closedSprints = sprints.filter(
    (sprint) => sprint.status === "closed",
  );

  const handleStart = async (sprint: Sprint) => {
    try {
      await startSprint({ id: sprint.id, projectId });
      toast.success(
        t("tasks:sprints.startSuccess", { name: sprint.name }),
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("tasks:sprints.error", { defaultValue: "Sprint action failed" }),
      );
    }
  };

  const handleReorder = async (
    sprint: Sprint,
    direction: "up" | "down",
  ) => {
    const index = futureSprints.findIndex((item) => item.id === sprint.id);
    const swapWith =
      direction === "up" ? futureSprints[index - 1] : futureSprints[index + 1];
    if (!swapWith) return;

    try {
      await reorderSprints({
        projectId,
        sprints: [
          { id: sprint.id, position: swapWith.position },
          { id: swapWith.id, position: sprint.position },
        ],
      });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("tasks:sprints.error", { defaultValue: "Sprint action failed" }),
      );
    }
  };

  const openEditDialog = (sprint: Sprint) => {
    setEditedSprint(sprint);
    setIsSprintDialogOpen(true);
  };

  const openCreateDialog = () => {
    setEditedSprint(null);
    setIsSprintDialogOpen(true);
  };

  return (
    <div className="border-b border-border/80 bg-card">
      <div className="flex items-center justify-between px-4 py-2">
        <div className="flex items-center gap-2">
          <Rocket className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("tasks:sprints.title")}
          </span>
        </div>
        <Button
          variant="ghost"
          size="xs"
          className="h-6 px-2 text-xs"
          onClick={openCreateDialog}
        >
          <Plus className="h-3 w-3 mr-1" />
          {t("tasks:sprints.create")}
        </Button>
      </div>

      <div className="flex flex-col gap-2 px-4 pb-3">
        {activeSprint ? (
          <div className="rounded-lg border border-primary/40 bg-primary/5 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 flex-col">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold">
                    {activeSprint.name}
                  </span>
                  <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-medium text-primary-foreground">
                    {t("tasks:sprints.activeBadge")}
                  </span>
                </div>
                <span className="truncate text-xs text-muted-foreground">
                  {activeSprint.goal ??
                    formatSprintRange(activeSprint, t) ??
                    ""}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {t("tasks:sprints.taskCounts", {
                    completed: activeSprint.completedTaskCount,
                    total: activeSprint.taskCount,
                  })}
                </span>
                <Button
                  variant="ghost"
                  size="xs"
                  className="h-6 px-2 text-xs"
                  onClick={() => setClosingSprint(activeSprint)}
                >
                  <SquareCheckBig className="h-3 w-3 mr-1" />
                  {t("tasks:sprints.close")}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  title={t("tasks:sprints.edit")}
                  onClick={() => openEditDialog(activeSprint)}
                >
                  <Pencil className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            {t("tasks:sprints.noActive")}
          </p>
        )}

        {futureSprints.length > 0 && (
          <div className="flex flex-col gap-1">
            {futureSprints.map((sprint, index) => (
              <div
                key={sprint.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-border/60 px-3 py-1.5"
              >
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium">
                    {sprint.name}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {sprint.goal ??
                      formatSprintRange(sprint, t) ??
                      t("tasks:sprints.upcoming")}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <span className="mr-1 text-xs text-muted-foreground">
                    {t("tasks:sprints.taskCounts", {
                      completed: sprint.completedTaskCount,
                      total: sprint.taskCount,
                    })}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    disabled={index === 0}
                    title={t("tasks:sprints.moveUp")}
                    onClick={() => handleReorder(sprint, "up")}
                  >
                    <ChevronUp className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    disabled={index === futureSprints.length - 1}
                    title={t("tasks:sprints.moveDown")}
                    onClick={() => handleReorder(sprint, "down")}
                  >
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    title={t("tasks:sprints.edit")}
                    onClick={() => openEditDialog(sprint)}
                  >
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="outline"
                    size="xs"
                    className="h-6 px-2 text-xs"
                    disabled={isStarting}
                    onClick={() => handleStart(sprint)}
                  >
                    <Play className="h-3 w-3 mr-1" />
                    {t("tasks:sprints.start")}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {closedSprints.length > 0 && (
          <Collapsible open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
            <CollapsibleTrigger className="flex items-center gap-1.5 py-1 text-xs text-muted-foreground hover:text-foreground">
              <History className="h-3.5 w-3.5" />
              {t("tasks:sprints.history", { count: closedSprints.length })}
              <ChevronDown
                className={`h-3 w-3 transition-transform ${isHistoryOpen ? "rotate-180" : ""}`}
              />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="flex flex-col gap-1 pt-1">
                {[...closedSprints].reverse().map((sprint) => (
                  <div
                    key={sprint.id}
                    className="flex items-center justify-between gap-2 rounded-md px-3 py-1 text-xs text-muted-foreground"
                  >
                    <span className="truncate font-medium">{sprint.name}</span>
                    <span>
                      {t("tasks:sprints.completedCount", {
                        count: sprint.completedTaskCount,
                      })}
                    </span>
                  </div>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}
      </div>

      <SprintDialog
        projectId={projectId}
        sprint={editedSprint}
        open={isSprintDialogOpen}
        onOpenChange={setIsSprintDialogOpen}
      />

      {closingSprint && (
        <CloseSprintDialog
          sprint={closingSprint}
          futureSprints={futureSprints}
          open={Boolean(closingSprint)}
          onOpenChange={(open) => {
            if (!open) setClosingSprint(null);
          }}
        />
      )}
    </div>
  );
}
