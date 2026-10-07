import { useTranslation } from "react-i18next";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useUpsertWorkflowRule } from "@/hooks/mutations/workflow-rule/use-upsert-workflow-rule";
import { useGetColumns } from "@/hooks/queries/column/use-get-columns";
import { useGetWorkflowRules } from "@/hooks/queries/workflow-rule/use-get-workflow-rules";
import { toast } from "@/lib/toast";

// The webhook events every provider emits; the labels are shared.
export const WORKFLOW_EVENT_TYPES = [
  "branch_push",
  "pr_opened",
  "pr_merged",
  "issue_opened",
  "issue_closed",
] as const;

type WorkflowEventType = (typeof WORKFLOW_EVENT_TYPES)[number];

type WorkflowRulesPanelProps = {
  projectId: string;
  integrationType: "github" | "gitea" | "gitlab";
  /**
   * RFC 0001 WP6/WP7: when set, rules are written for one repository binding;
   * without it they stay type-wide and apply to every repository of the
   * provider type in the project.
   */
  integrationId?: string;
};

/**
 * Renders the workflow rules of one provider for one scope. When the scope is
 * a single repository binding, a repository-specific rule wins and the
 * type-wide rule only shows as the fallback that currently applies (WP6).
 */
export function WorkflowRulesPanel({
  projectId,
  integrationType,
  integrationId,
}: WorkflowRulesPanelProps) {
  const { t } = useTranslation();
  const { data: columns, isLoading: columnsLoading } = useGetColumns(projectId);
  const { data: rules, isLoading: rulesLoading } =
    useGetWorkflowRules(projectId);
  const { mutateAsync: upsertRule } = useUpsertWorkflowRule();

  if (columnsLoading || rulesLoading) {
    return (
      <div className="text-sm text-muted-foreground">
        {t("settings:workflowEditor.loading")}
      </div>
    );
  }

  if (!columns || columns.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">
        {t("settings:workflowEditor.createColumnsFirst")}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {WORKFLOW_EVENT_TYPES.map((eventType: WorkflowEventType) => {
        const bindingRule = rules?.find(
          (rule) =>
            rule.integrationType === integrationType &&
            rule.integrationId === (integrationId ?? null) &&
            rule.eventType === eventType,
        );
        // WP6: without a repository-specific rule, the type-wide rule applies.
        const typeWideRule = rules?.find(
          (rule) =>
            rule.integrationType === integrationType &&
            rule.integrationId === null &&
            rule.eventType === eventType,
        );
        const currentRule = bindingRule ?? typeWideRule;

        return (
          <div
            key={`${integrationType}-${integrationId ?? "wide"}-${eventType}`}
            className="flex items-center justify-between gap-4 p-3 border border-border rounded-md bg-sidebar"
          >
            <span className="text-sm">
              {t(`settings:workflowEditor.events.${eventType}`)}
            </span>
            <Select
              value={currentRule?.columnId ?? ""}
              onValueChange={async (value) => {
                if (!value) return;
                try {
                  await upsertRule({
                    projectId,
                    data: {
                      integrationType,
                      ...(integrationId ? { integrationId } : {}),
                      eventType,
                      columnId: value,
                    },
                  });
                  toast.success(t("settings:workflowEditor.toastUpdated"));
                } catch (error) {
                  toast.error(
                    error instanceof Error
                      ? error.message
                      : t("settings:workflowEditor.toastError"),
                  );
                }
              }}
            >
              <SelectTrigger className="w-48 h-8 text-sm">
                <SelectValue
                  placeholder={t(
                    "settings:workflowEditor.selectColumnPlaceholder",
                  )}
                >
                  {columns.find((column) => column.id === currentRule?.columnId)
                    ?.name ??
                    t("settings:workflowEditor.selectColumnPlaceholder")}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {columns.map((column) => (
                  <SelectItem key={column.id} value={column.id}>
                    {column.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        );
      })}
    </div>
  );
}
