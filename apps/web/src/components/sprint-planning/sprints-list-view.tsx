import { differenceInCalendarDays } from "date-fns";
import {
  ChevronDown,
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
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { formatDateShort } from "@/lib/format";
import { toast } from "@/lib/toast";
import { useStartSprint } from "@/hooks/mutations/sprint/use-start-sprint";
import { useGetSprints } from "@/hooks/queries/sprint/use-get-sprints";
import useProjectStore from "@/store/project";
import type Sprint from "@/types/sprint";
import type Task from "@/types/task";
import {
  CarriedOverTaskRow,
  SprintTaskRow,
} from "./sprint-planning-view";
import CloseSprintDialog from "./close-sprint-dialog";
import SprintDialog from "./sprint-dialog";

type SprintsListViewProps = {
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

// The full sprint history as one collapsible list: every sprint of the
// project, each expanding to the issues assigned to it, closed ones included.
export default function SprintsListView({
  projectId,
}: SprintsListViewProps) {
  const { t } = useTranslation();
  const { data: sprints = [] } = useGetSprints(projectId);
  const project = useProjectStore((state) => state.project);
  const { mutateAsync: startSprint, isPending: isStarting } =
    useStartSprint();

  const [isSprintDialogOpen, setIsSprintDialogOpen] = useState(false);
  const [editedSprint, setEditedSprint] = useState<Sprint | null>(null);
  const [closingSprint, setClosingSprint] = useState<Sprint | null>(null);
  const [expandedSprints, setExpandedSprints] = useState<
    Record<string, boolean>
  >({});

  const activeSprint = sprints.find((sprint) => sprint.status === "active");
  const futureSprints = sprints.filter((sprint) => sprint.status === "future");
  const closedSprints = sprints.filter(
    (sprint) => sprint.status === "closed",
  );

  // Sprint tasks live in the board columns and the planned backlog; archived
  // tasks stay out of the sprint lists.
  const sprintTasks = project
    ? [
        ...project.plannedTasks,
        ...project.columns.flatMap((column) => column.tasks),
      ]
    : [];

  const tasksForSprint = (sprintId: string) =>
    sprintTasks.filter((task) => task.sprintId === sprintId);

  const toggleSprintTasks = (sprintId: string) => {
    setExpandedSprints((prev) => ({ ...prev, [sprintId]: !prev[sprintId] }));
  };

  const handleStart = async (sprint: Sprint) => {
    try {
      await startSprint({ id: sprint.id, projectId });
      toast.success(t("tasks:sprints.startSuccess", { name: sprint.name }));
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

  const renderTaskList = (sprint: Sprint) => {
    const tasks = tasksForSprint(sprint.id);
    const carriedOver = sprint.carryOverTasks ?? [];
    return (
      <div className="flex flex-col gap-0.5 pt-1 pl-2">
        {tasks.length === 0 && carriedOver.length === 0 ? (
          <span className="px-3 py-1 text-xs text-muted-foreground">
            {t("tasks:sprints.noTasks")}
          </span>
        ) : (
          tasks.map((task) => <SprintTaskRow key={task.id} task={task} />)
        )}
        {carriedOver.length > 0 && (
          <div className="flex flex-col gap-0.5 pt-1">
            <span className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t("tasks:sprints.carriedOver")}
            </span>
            {carriedOver.map((snapshot) => {
              const liveTask = sprintTasks.find(
                (task) => task.id === snapshot.id,
              );
              return liveTask ? (
                <SprintTaskRow key={snapshot.id} task={liveTask} />
              ) : (
                <CarriedOverTaskRow key={snapshot.id} title={snapshot.title} />
              );
            })}
          </div>
        )}
        {sprint.status === "closed" && (
          <span className="px-3 py-1 text-xs text-muted-foreground">
            {t("tasks:sprints.reportSummary", {
              planned: sprint.completedTaskCount + carriedOver.length,
              completed: sprint.completedTaskCount,
              carriedOver: carriedOver.length,
            })}
          </span>
        )}
      </div>
    );
  };

  const renderSprint = (sprint: Sprint) => {
    const progressPercent =
      sprint.taskCount > 0
        ? Math.round((sprint.completedTaskCount / sprint.taskCount) * 100)
        : null;
    const remainingDays = sprint.endDate
      ? differenceInCalendarDays(new Date(sprint.endDate), new Date())
      : null;

    return (
      <Collapsible
        key={sprint.id}
        open={expandedSprints[sprint.id] ?? false}
        onOpenChange={() => toggleSprintTasks(sprint.id)}
      >
        <div className="flex items-center justify-between gap-2 rounded-lg border border-border/60 px-3 py-1.5">
          <div className="flex min-w-0 flex-col">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-medium">
                {sprint.name}
              </span>
              {sprint.status === "active" && (
                <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-medium text-primary-foreground">
                  {t("tasks:sprints.activeBadge")}
                </span>
              )}
            </div>
            <span className="truncate text-xs text-muted-foreground">
              {sprint.goal ?? formatSprintRange(sprint, t) ?? ""}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {t("tasks:sprints.taskCounts", {
                completed: sprint.completedTaskCount,
                total: sprint.taskCount,
              })}
            </span>
            {progressPercent !== null && (
              <span className="hidden items-center gap-2 sm:flex">
                <span className="h-1.5 w-28 overflow-hidden rounded-full bg-muted">
                  <span
                    className="block h-full rounded-full bg-primary"
                    style={{ width: `${progressPercent}%` }}
                  />
                </span>
                <span className="text-xs text-muted-foreground">
                  {progressPercent}%
                </span>
              </span>
            )}
            {sprint.status === "active" && remainingDays !== null && (
              <span
                className={
                  remainingDays >= 0
                    ? "text-xs font-medium text-primary"
                    : "text-xs font-medium text-destructive"
                }
              >
                {remainingDays > 0 &&
                  t("tasks:sprints.daysRemaining", { remaining: remainingDays })}
                {remainingDays === 0 && t("tasks:sprints.endsToday")}
                {remainingDays < 0 &&
                  t("tasks:sprints.daysOverdue", {
                    remaining: Math.abs(remainingDays),
                  })}
              </span>
            )}
            {sprint.status === "active" && (
              <Button
                variant="ghost"
                size="xs"
                className="h-6 px-2 text-xs"
                onClick={() => setClosingSprint(sprint)}
              >
                <SquareCheckBig className="h-3 w-3 mr-1" />
                {t("tasks:sprints.close")}
              </Button>
            )}
            {sprint.status === "future" && (
              <>
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
              </>
            )}
            {sprint.status === "active" && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                title={t("tasks:sprints.edit")}
                onClick={() => openEditDialog(sprint)}
              >
                <Pencil className="h-3 w-3" />
              </Button>
            )}
            <CollapsibleTrigger
              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
              title={t("tasks:sprints.toggleTasks")}
            >
              <ChevronDown
                className={`h-3 w-3 transition-transform ${
                  expandedSprints[sprint.id] ? "rotate-180" : ""
                }`}
              />
            </CollapsibleTrigger>
          </div>
        </div>
        <CollapsibleContent>
          {renderTaskList(sprint)}
        </CollapsibleContent>
      </Collapsible>
    );
  };

  if (sprints.length === 0) {
    return (
      <>
        <div className="flex h-full items-center justify-center px-4 py-10">
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Rocket />
              </EmptyMedia>
              <EmptyTitle>
                <h2>{t("tasks:sprints.viewEmptyTitle")}</h2>
              </EmptyTitle>
              <EmptyDescription>
                {t("tasks:sprints.viewEmptyDescription")}
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button size="sm" onClick={openCreateDialog}>
                <Plus className="h-4 w-4 mr-1" />
                {t("tasks:sprints.create")}
              </Button>
            </EmptyContent>
          </Empty>
        </div>
        <SprintDialog
          open={isSprintDialogOpen}
          onOpenChange={setIsSprintDialogOpen}
          projectId={projectId}
          sprint={editedSprint}
        />
      </>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between px-4 py-2">
        <h1 className="text-sm font-semibold">
          {t("tasks:sprints.viewHeading")}
        </h1>
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
      <div className="flex flex-col gap-2 px-4 pb-4">
        {activeSprint ? (
          renderSprint(activeSprint)
        ) : (
          <p className="text-xs text-muted-foreground">
            {t("tasks:sprints.noActive")}
          </p>
        )}
        {futureSprints.length > 0 && (
          <div className="flex flex-col gap-2 pt-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t("tasks:sprints.upcoming")}
            </span>
            {futureSprints.map((sprint) => renderSprint(sprint))}
          </div>
        )}
        {closedSprints.length > 0 && (
          <div className="flex flex-col gap-2 pt-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t("tasks:sprints.history", {
                count: closedSprints.length,
              })}
            </span>
            {closedSprints.map((sprint) => renderSprint(sprint))}
          </div>
        )}
      </div>
      <SprintDialog
        open={isSprintDialogOpen}
        onOpenChange={setIsSprintDialogOpen}
        projectId={projectId}
        sprint={editedSprint}
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
    </>
  );
}
