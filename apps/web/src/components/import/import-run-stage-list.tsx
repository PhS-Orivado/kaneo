import { Check, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/cn";

export const IMPORT_STAGES = [
  "reading",
  "sprints",
  "users",
  "tasks",
] as const;

export type DisplayedStage = (typeof IMPORT_STAGES)[number];

export type StageState = "done" | "current" | "pending";

// "done" means every stage finished; before that the position of the current
// stage decides what already completed.
export function getStageStates(
  stage: string,
): Record<DisplayedStage, StageState> {
  const position = (IMPORT_STAGES as readonly string[]).indexOf(stage);
  const states = {} as Record<DisplayedStage, StageState>;
  IMPORT_STAGES.forEach((displayed, index) => {
    states[displayed] =
      position === -1 || index < position
        ? "done"
        : index === position
          ? "current"
          : "pending";
  });
  return states;
}

// The live checklist under a running import: reading the source, then the
// sprints, the users, and the issues. It gives the run page a visible
// goal-line that the single progress message alone never showed.
export function ImportRunStageList({ stage }: { stage: string }) {
  const { t } = useTranslation();
  const states = getStageStates(stage);

  return (
    <ul className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
      {IMPORT_STAGES.map((displayed) => {
        const state = states[displayed];
        return (
          <li
            key={displayed}
            className="flex items-center gap-1 text-xs"
            aria-current={state === "current" ? "step" : undefined}
          >
            {state === "done" ? (
              <Check aria-hidden="true" className="size-3 text-primary" />
            ) : state === "current" ? (
              <Loader2 aria-hidden="true" className="size-3 animate-spin" />
            ) : (
              <span
                aria-hidden="true"
                className="size-1.5 rounded-full bg-muted-foreground/50"
              />
            )}
            <span
              className={cn(
                state === "pending" && "text-muted-foreground/70",
                state === "current" && "font-medium text-foreground",
                state === "done" && "text-muted-foreground",
              )}
            >
              {t(`settings:workspaceImport.stages.${displayed}`)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
