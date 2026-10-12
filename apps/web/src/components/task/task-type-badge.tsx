import { Bug, ListChecks } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import type Task from "@/types/task";

type TaskTypeBadgeProps = {
  task: Task;
  className?: string;
};

// Read-only type indicator. The type is set at creation (bugs default to the
// active sprint, everything else to the backlog) and is not editable after.
export default function TaskTypeBadge({ task, className }: TaskTypeBadgeProps) {
  const { t } = useTranslation();
  const isBug = task.type === "bug";

  return (
    <Button
      variant="ghost"
      size="sm"
      className={`justify-start h-7 px-1.5 gap-1.5 ${className ?? ""}`}
      title={t("tasks:type.label")}
    >
      {isBug ? (
        <Bug className="h-3.5 w-3.5 text-destructive" />
      ) : (
        <ListChecks className="h-3.5 w-3.5 text-muted-foreground" />
      )}
      <span className="text-xs font-semibold truncate">
        {isBug ? t("tasks:type.bug") : t("tasks:type.task")}
      </span>
    </Button>
  );
}
