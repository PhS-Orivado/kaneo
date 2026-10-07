import { Plus } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { BindingSettingsDialog } from "@/components/project/integration-repositories/binding-settings-dialog";
import { BindingSyncRulesDialog } from "@/components/project/integration-repositories/binding-sync-rules-dialog";
import { BindingWorkflowRulesDialog } from "@/components/project/integration-repositories/binding-workflow-rules-dialog";
import { DisconnectIntegrationDialog } from "@/components/project/integration-repositories/disconnect-integration-dialog";
import {
  parseAddBindingError,
  type AddBindingError,
} from "@/components/project/integration-repositories/add-binding-error";
import { GitlabAddRepositoryDialog } from "@/components/project/integration-repositories/gitlab-add-repository-dialog";
import { GitlabConnectForm } from "@/components/project/integration-repositories/gitlab-connect-form";
import { IntegrationRepositoryList } from "@/components/project/integration-repositories/integration-repository-list";
import { RepositoryUsageBadge } from "@/components/project/integration-repositories/repository-usage-badge";
import { GitlabProjectBrowserModal } from "@/components/project/gitlab-project-browser-modal";
import { Button } from "@/components/ui/button";
import {
  useCreateGitlabIntegration,
  useDeleteGitlabIntegration,
} from "@/hooks/mutations/gitlab-integration/use-create-gitlab-integration";
import useImportGitlabIssues from "@/hooks/mutations/gitlab-integration/use-import-gitlab-issues";
import { useUpdateGitlabIntegration } from "@/hooks/mutations/gitlab-integration/use-update-gitlab-integration";
import useListGitlabIntegrations from "@/hooks/queries/gitlab-integration/use-list-gitlab-integrations";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { toast } from "@/lib/toast";
import {
  toGitlabBindingRow,
  type RepositoryBindingRow,
} from "@/types/repository-binding";

/**
 * RFC 0001 WP7: the GitLab settings surface lists every project binding of
 * the project. The first binding is created through the connect form (with
 * its own browser pass); further bindings are added through the add dialog,
 * which collects fresh credentials and creates the picked project.
 */
export function GitlabIntegrationSettings({
  projectId,
}: {
  projectId: string;
}) {
  const { t } = useTranslation();
  const { canCreateTasks, canUpdateTasks } = useWorkspacePermission();
  const hasImportPermission = canCreateTasks() && canUpdateTasks();

  const {
    data: list,
    isLoading,
    error,
    refetch,
  } = useListGitlabIntegrations(projectId);
  const rows = useMemo(
    () => (list?.integrations ?? []).map(toGitlabBindingRow),
    [list],
  );

  const { mutateAsync: createIntegration, isPending: isCreating } =
    useCreateGitlabIntegration();
  const { mutateAsync: deleteIntegration, isPending: isDisconnecting } =
    useDeleteGitlabIntegration();
  const { mutateAsync: updateSettings, isPending: isUpdatingSettings } =
    useUpdateGitlabIntegration();
  const { mutateAsync: importIssues } = useImportGitlabIssues();

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showFirstBindingBrowser, setShowFirstBindingBrowser] =
    useState(false);
  const [firstBindingCredentials, setFirstBindingCredentials] = useState<{
    baseUrl: string;
    accessToken: string;
    tokenType: "private" | "bearer";
  }>({ baseUrl: "https://gitlab.com", accessToken: "", tokenType: "private" });
  const [addError, setAddError] = useState<AddBindingError | null>(null);
  const [importingIds, setImportingIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [settingsRow, setSettingsRow] = useState<RepositoryBindingRow | null>(
    null,
  );
  const [syncRulesRow, setSyncRulesRow] =
    useState<RepositoryBindingRow | null>(null);
  const [workflowRulesRow, setWorkflowRulesRow] =
    useState<RepositoryBindingRow | null>(null);
  const [disconnectRow, setDisconnectRow] =
    useState<RepositoryBindingRow | null>(null);

  // Stable per-row predicate so memoized rows do not re-render on each pass
  // (rerender-memo).
  const isImportDisabled = useCallback(
    () => !hasImportPermission,
    [hasImportPermission],
  );

  // RFC 0001 D2: a failed add keeps the browser open; the server's own
  // blocker message (plan limit 402, duplicate 409) is shown inline.
  const handleFirstBindingSelect = async (projectPath: string) => {
    try {
      await createIntegration({
        projectId,
        data: {
          baseUrl: firstBindingCredentials.baseUrl,
          accessToken: firstBindingCredentials.accessToken,
          tokenType: firstBindingCredentials.tokenType,
          projectPath,
        },
      });
      setAddError(null);
      setShowFirstBindingBrowser(false);
      setFirstBindingCredentials({
        baseUrl: "https://gitlab.com",
        accessToken: "",
        tokenType: "private",
      });
      toast.success(t("settings:gitlabIntegration.toast.updated"));
    } catch (error) {
      setAddError(parseAddBindingError(error));
    }
  };

  const handleCommentTaskLinkChange = async (
    row: RepositoryBindingRow,
    checked: boolean,
  ) => {
    try {
      await updateSettings({
        integrationId: row.integrationId,
        json: { commentTaskLinkOnGitlabIssue: checked },
      });
      toast.success(
        checked
          ? t("settings:gitlabIntegration.toast.commentOnEnabled")
          : t("settings:gitlabIntegration.toast.commentOnDisabled"),
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("settings:gitlabIntegration.toast.settingsUpdateError"),
      );
    }
  };

  const handleImportIssues = async (row: RepositoryBindingRow) => {
    if (!hasImportPermission) return;
    setImportingIds((current) => new Set(current).add(row.integrationId));
    try {
      await importIssues({ integrationId: row.integrationId, projectId });
      toast.success(t("settings:gitlabIntegration.toast.issuesImported"));
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("settings:gitlabIntegration.toast.importError"),
      );
    } finally {
      setImportingIds((current) => {
        const next = new Set(current);
        next.delete(row.integrationId);
        return next;
      });
    }
  };

  const handleDisconnect = async (row: RepositoryBindingRow) => {
    try {
      await deleteIntegration(row.integrationId);
      setDisconnectRow(null);
      if (settingsRow?.integrationId === row.integrationId) {
        setSettingsRow(null);
      }
      toast.success(t("settings:gitlabIntegration.toast.removed"));
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("settings:gitlabIntegration.toast.removeError"),
      );
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="space-y-4 rounded-xl border border-border bg-card p-4">
          <div className="h-4 w-40 animate-pulse rounded bg-muted" />
          <div className="h-10 w-full animate-pulse rounded bg-muted" />
          <div className="h-10 w-full animate-pulse rounded bg-muted" />
        </div>
        <div className="space-y-4 rounded-xl border border-border bg-card p-4">
          <div className="h-4 w-40 animate-pulse rounded bg-muted" />
          <div className="h-10 w-full animate-pulse rounded bg-muted" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {rows.length === 0 ? (
        <div className="space-y-4 rounded-xl border border-border bg-card p-4">
          <div className="space-y-0.5">
            <p className="text-sm font-medium">
              {t("settings:repositoryBindings.addFirstTitle")}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("settings:repositoryBindings.addFirstHint")}
            </p>
          </div>
          <GitlabConnectForm
            projectId={projectId}
            onOpenBrowser={(credentials) => {
              setFirstBindingCredentials(credentials);
              setAddError(null);
              setShowFirstBindingBrowser(true);
            }}
          />
        </div>
      ) : (
        <div className="space-y-4 rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-2">
              <p className="text-sm font-medium">
                {t("settings:repositoryBindings.listTitle")}
              </p>
              {list?.usage ? <RepositoryUsageBadge usage={list.usage} /> : null}
            </div>
            <Button
              type="button"
              size="sm"
              disabled={isCreating}
              onClick={() => setShowAddDialog(true)}
            >
              <Plus aria-hidden="true" className="size-3" />
              {t("settings:repositoryBindings.addMore")}
            </Button>
          </div>
          <IntegrationRepositoryList
            rows={rows}
            isLoading={false}
            error={error instanceof Error ? error : null}
            onRetry={() => void refetch()}
            importingIds={importingIds}
            isImportDisabled={isImportDisabled}
            onOpenSettings={setSettingsRow}
            onOpenSyncRules={setSyncRulesRow}
            onOpenWorkflowRules={setWorkflowRulesRow}
            onImportIssues={(row) => void handleImportIssues(row)}
            onDisconnect={setDisconnectRow}
          />
        </div>
      )}

      <BindingSettingsDialog
        row={settingsRow}
        isUpdating={isUpdatingSettings}
        onCommentTaskLinkChange={(row, checked) =>
          void handleCommentTaskLinkChange(row, checked)
        }
        onClose={() => setSettingsRow(null)}
      />
      <BindingSyncRulesDialog
        row={syncRulesRow}
        onClose={() => setSyncRulesRow(null)}
      />
      <BindingWorkflowRulesDialog
        row={workflowRulesRow}
        projectId={projectId}
        onClose={() => setWorkflowRulesRow(null)}
      />
      <DisconnectIntegrationDialog
        row={disconnectRow}
        isPending={isDisconnecting}
        onConfirm={(row) => void handleDisconnect(row)}
        onCancel={() => setDisconnectRow(null)}
      />
      <GitlabAddRepositoryDialog
        projectId={projectId}
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
      />
      <GitlabProjectBrowserModal
        projectId={projectId}
        open={showFirstBindingBrowser}
        onOpenChange={(open) => {
          if (!open) {
            setAddError(null);
          }
          setShowFirstBindingBrowser(open);
        }}
        onSelectProject={(projectPath) =>
          void handleFirstBindingSelect(projectPath)
        }
        baseUrl={firstBindingCredentials.baseUrl}
        accessToken={firstBindingCredentials.accessToken}
        tokenType={firstBindingCredentials.tokenType}
        addError={addError}
        onDismissError={() => setAddError(null)}
      />
    </div>
  );
}
