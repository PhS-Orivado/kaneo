import { useState } from "react";
import { useTranslation } from "react-i18next";
import { IntegrationCheckLine } from "@/components/project/integrations/panel/integration-check-line";
import { IntegrationPanelSection } from "@/components/project/integrations/panel/integration-panel-section";
import { Button } from "@/components/ui/button";
import type { SyncParams } from "@/fetchers/integration-sync/types";
import { useSyncRules } from "@/hooks/queries/integration-sync/use-sync-rules";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { useUserPreferencesStore } from "@/store/user-preferences";
import { PausedLinksCallout } from "./paused-links-callout";
import { PausedLinksList } from "./paused-links-list";
import { ResumeSyncDialog } from "./resume-sync-dialog";
import { SyncRulesEditor } from "./sync-rules-editor";
import { SyncRulesSummary } from "./sync-rules-summary";

export function SyncRulesSection({ projectId, provider }: SyncParams) {
  const { t } = useTranslation();
  const advanced = useUserPreferencesStore((state) => state.advancedSettings);
  const { canManageSettings, canUpdateTasks } = useWorkspacePermission();
  const canManage = canManageSettings();
  const canResume = canManage && canUpdateTasks();
  const [editing, setEditing] = useState(false);
  const [showPaused, setShowPaused] = useState(false);
  const [pages, setPages] = useState<string[]>([]);
  const [reviewTask, setReviewTask] = useState<{
    taskId: string;
    linkId: string;
  } | null>(null);
  // RFC 0001 WP5/WP7: the section is addressed by the repository binding the
  // row represents, never by the project, so sibling bindings never share
  // rules, paused links or a resume flow by accident.
  const query = useSyncRules(scope, pages.at(-1));
  const data = query.data;
  const canEdit = advanced && canManage;
  const label = t("settings:syncRules.title");

  if (query.isPending) {
    return (
      <IntegrationPanelSection label={label}>
        <p role="status" className="text-xs text-muted-foreground">
          {t("settings:syncRules.loading")}
        </p>
      </IntegrationPanelSection>
    );
  }
  if (query.isError || !data) {
    return (
      <IntegrationPanelSection label={label}>
        <IntegrationCheckLine
          tone="destructive"
          action={
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void query.refetch()}
            >
              {t("settings:codeHosting.retry")}
            </Button>
          }
        >
          {t("settings:syncRules.loadError")}
        </IntegrationCheckLine>
      </IntegrationPanelSection>
    );
  }

  return (
    <IntegrationPanelSection
      label={label}
      action={
        canEdit && !editing ? (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="-my-1"
            onClick={() => setEditing(true)}
          >
            {t("settings:syncRules.edit")}
          </Button>
        ) : null
      }
    >
      <SyncRulesSummary provider={provider} data={data} />
      {!data.isActive && (
        <p role="status" className="text-xs text-muted-foreground">
          {t("settings:syncRules.inactiveHint")}
        </p>
      )}
      {data.missingLabels.length > 0 && (
        <IntegrationCheckLine tone="destructive">
          {t("settings:syncRules.missingLabels")}
        </IntegrationCheckLine>
      )}
      {!advanced && canManage ? (
          {t("settings:syncRules.missingLabels")}
        </IntegrationCheckLine>
      )}
      {!advanced && canManage ? (
        <p className="text-xs text-muted-foreground">
          {t("settings:syncRules.advancedHint")}
        </p>
      ) : null}
      {canEdit && editing ? (
        <SyncRulesEditor
          key={`${projectId}:${provider}`}
          param={param}
          saved={data}
          onDone={() => setEditing(false)}
        />
      ) : null}
      {canEdit && editing ? (
        <SyncRulesEditor
          key={
            scope.kind === "binding"
              ? scope.integrationId
              : `${scope.projectId}:${scope.provider}`
          }
          scope={scope}
          saved={data}
          onDone={() => setEditing(false)}
        />
      ) : null}
      {data.paused > 0 && (
        <>
          <PausedLinksCallout
            count={data.paused}
            open={showPaused}
            onToggle={() => setShowPaused((current) => !current)}
          />
          {showPaused ? (
            <PausedLinksList
              data={data}
              canResume={canResume}
              hasPrevious={pages.length > 0}
              loadingPage={query.isPlaceholderData}
              onReview={setReviewTask}
              onPrevious={() => setPages((current) => current.slice(0, -1))}
              onNext={(cursor) => setPages((current) => [...current, cursor])}
            />
          ) : null}
        </>
      )}
      {reviewTask && (
        <ResumeSyncDialog
          scope={scope}
          linkId={reviewTask.linkId}
          taskId={reviewTask.taskId}
          onClose={() => setReviewTask(null)}
        />
      )}
    </IntegrationPanelSection>
  );
}
}
