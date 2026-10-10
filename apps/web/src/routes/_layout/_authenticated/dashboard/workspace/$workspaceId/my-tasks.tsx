import { createFileRoute } from "@tanstack/react-router";
import { CircleCheck, Filter } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import WorkspaceLayout from "@/components/common/workspace-layout";
import { TaskAttributeIcon } from "@/components/task-attribute-badge";
import TaskAttributeFilterList, {
  TASK_ATTRIBUTE_FILTER_NONE,
} from "@/components/task/task-attribute-filter-list";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/menu";
import {
  type MyTasksGroupBy,
  MyTasksGroupByToggle,
} from "@/components/my-tasks/my-tasks-group-by";
import { MyTasksList } from "@/components/my-tasks/my-tasks-list";
import PageTitle from "@/components/page-title";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import useGetAssignedTasks from "@/hooks/queries/task/use-get-assigned-tasks";
import useGetTaskAttributes from "@/hooks/queries/task-attribute/use-get-task-attributes";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/my-tasks",
)({
  component: RouteComponent,
});

function RouteComponent() {
  const { t } = useTranslation();
  const { workspaceId } = Route.useParams();
  const {
    data: assigned,
    isLoading,
    isError,
  } = useGetAssignedTasks(workspaceId);
  const [groupBy, setGroupBy] = useState<MyTasksGroupBy>("dueDate");
  const [attributeFilter, setAttributeFilter] = useState<string | null>(null);
  const { data: taskAttributes = [] } = useGetTaskAttributes(workspaceId);

  const selectedAttribute = attributeFilter
    ? taskAttributes.find((attribute) => attribute.id === attributeFilter)
    : undefined;

  const attributeFilterName = useMemo(() => {
    if (!attributeFilter) return null;
    if (attributeFilter === TASK_ATTRIBUTE_FILTER_NONE) {
      return t("tasks:boardFilters.noType", { defaultValue: "No type" });
    }
    return selectedAttribute?.name ?? attributeFilter;
  }, [attributeFilter, selectedAttribute, t]);

  const visibleTasks = useMemo(() => {
    if (!attributeFilter) return assigned?.tasks ?? [];
    return (
      assigned?.tasks.filter(
        (task) =>
          (task.attribute?.id ?? TASK_ATTRIBUTE_FILTER_NONE) ===
          attributeFilter,
      ) ?? []
    );
  }, [assigned, attributeFilter]);

  return (
    <>
      <PageTitle title={t("workspace:myTasks.pageTitle")} />
      <WorkspaceLayout
        title={t("workspace:myTasks.pageTitle")}
        headerActions={
          assigned?.tasks.length ? (
            <div className="flex items-center gap-2">
              {taskAttributes.length > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 gap-1.5 px-2 text-xs font-medium"
                      />
                    }
                  >
                    <Filter className="h-3 w-3" />
                    {attributeFilter ? (
                      attributeFilter === TASK_ATTRIBUTE_FILTER_NONE ? (
                        <span>{attributeFilterName}</span>
                      ) : (
                        <>
                          {selectedAttribute && (
                            <TaskAttributeIcon attribute={selectedAttribute} />
                          )}
                          <span>{attributeFilterName}</span>
                        </>
                      )
                    ) : (
                      <span>
                        {t("tasks:boardFilters.subjects.attribute", {
                          defaultValue: "Type",
                        })}
                      </span>
                    )}
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-56" align="end">
                    <DropdownMenuItem
                      closeOnClick
                      onClick={() => setAttributeFilter(null)}
                    >
                      {t("tasks:boardFilters.allAttributes", {
                        defaultValue: "All types",
                      })}
                    </DropdownMenuItem>
                    <TaskAttributeFilterList
                      attributes={taskAttributes}
                      selectedIds={attributeFilter ? [attributeFilter] : []}
                      onToggle={(attributeId) =>
                        setAttributeFilter((current) =>
                          current === attributeId ? null : attributeId,
                        )
                      }
                    />
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              <MyTasksGroupByToggle value={groupBy} onChange={setGroupBy} />
            </div>
          ) : null
        }
      >
        <div className="h-full overflow-y-auto">
          {isLoading ? (
            <div className="flex flex-col px-4">
              {[1, 2, 3, 4].map((row) => (
                <div
                  key={row}
                  className="flex h-11 items-center gap-3 border-border/50 border-b px-1"
                >
                  <Skeleton className="size-4 rounded-full" />
                  <Skeleton className="h-3.5 w-14" />
                  <Skeleton className="h-3.5 flex-1" />
                  <Skeleton className="h-3.5 w-16" />
                </div>
              ))}
            </div>
          ) : isError && !assigned ? (
            <p role="alert" className="p-6 text-muted-foreground text-sm">
              {t("workspace:myWork.loadError")}
            </p>
          ) : !assigned?.tasks.length ? (
            <Empty className="min-h-[60vh]">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <CircleCheck />
                </EmptyMedia>
                <EmptyTitle>{t("workspace:myWork.empty")}</EmptyTitle>
                <EmptyDescription>
                  {t("workspace:myTasks.emptyDescription")}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <MyTasksList
              tasks={visibleTasks}
              total={assigned.total}
              groupBy={groupBy}
              workspaceId={workspaceId}
            />
          )}
        </div>
      </WorkspaceLayout>
    </>
  );
}
