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
import { GiteaAddRepositoryDialog } from "@/components/project/integration-repositories/gitea-add-repository-dialog";
import { GiteaConnectForm } from "@/components/project/integration-repositories/gitea-connect-form";
import { IntegrationRepositoryList } from "@/components/project/integration-repositories/integration-repository-list";
import { RepositoryUsageBadge } from "@/components/project/integration-repositories/repository-usage-badge";
import { GiteaRepositoryBrowserModal } from "@/components/project/gitea-repository-browser-modal";
import { Button } from "@/components/ui/button";
import {
  useCreateGiteaIntegration,
  useDeleteGiteaIntegration,
} from "@/hooks/mutations/gitea-integration/use-create-gitea-integration";
import useImportGiteaIssues from "@/hooks/mutations/gitea-integration/use-import-gitea-issues";
import { useUpdateGiteaIntegration } from "@/hooks/mutations/gitea-integration/use-update-gitea-integration";
import useListGiteaIntegrations from "@/hooks/queries/gitea-integration/use-list-gitea-integrations";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { toast } from "@/lib/toast";
import {
  toGiteaBindingRow,
  type RepositoryBindingRow,
} from "@/types/repository-binding";

/**
 * RFC 0001 WP7: the Gitea settings surface lists every repository binding of
 * the project. The first binding is created through the connect form (with
 * its own browser pass); further bindings are added through the add dialog,
 * which collects fresh credentials and creates the picked repository.
 */
export function GiteaIntegrationSettings({ projectId }: { projectId: string }) {
  const { t } = useTranslation();
  const { canCreateTasks, canUpdateTasks } = useWorkspacePermission();
  const hasImportPermission = canCreateTasks() && canUpdateTasks();

  const {
    data: list,
    isLoading,
    error,
    refetch,
  } = useListGiteaIntegrations(projectId);
  const rows = useMemo(
    () => (list?.integrations ?? []).map(toGiteaBindingRow),
    [list],
  );

  const { mutateAsync: createIntegration, isPending: isCreating } =
    useCreateGiteaIntegration();
  const { mutateAsync: deleteIntegration, isPending: isDisconnecting } =
    useDeleteGiteaIntegration();
  const { mutateAsync: updateSettings, isPending: isUpdatingSettings } =
    useUpdateGiteaIntegration();
  const { mutateAsync: importIssues } = useImportGiteaIssues();

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showFirstBindingBrowser, setShowFirstBindingBrowser] = useState(false);
  const [firstBindingCredentials, setFirstBindingCredentials] = useState<{
    baseUrl: string;
    accessToken: string;
  }>({ baseUrl: "", accessToken: "" });
  const [addError, setAddError] = useState<AddBindingError | null>(null);
  const [importingIds, setImportingIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [settingsRow, setSettingsRow] = useState<RepositoryBindingRow | null>(
    null,
  );
  const [syncRulesRow, setSyncRulesRow] = useState<RepositoryBindingRow | null>(
    null,
  );
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
  const handleFirstBindingSelect = async (repository: {
    owner: string;
    name: string;
  }) => {
    try {
      await createIntegration({
        projectId,
        data: {
          baseUrl: firstBindingCredentials.baseUrl,
          accessToken: firstBindingCredentials.accessToken,
          repositoryOwner: repository.owner,
          repositoryName: repository.name,
        },
      });
      setAddError(null);
      setShowFirstBindingBrowser(false);
      setFirstBindingCredentials({ baseUrl: "", accessToken: "" });
      toast.success(t("settings:giteaIntegration.toast.updated"));
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
        json: { commentTaskLinkOnGiteaIssue: checked },
      });
      toast.success(
        checked
          ? t("settings:giteaIntegration.toast.commentOnEnabled")
          : t("settings:giteaIntegration.toast.commentOnDisabled"),
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("settings:giteaIntegration.toast.settingsUpdateError"),
      );
    }
  };

  const handleImportIssues = async (row: RepositoryBindingRow) => {
    if (!hasImportPermission) return;
    setImportingIds((current) => new Set(current).add(row.integrationId));
    try {
      await importIssues({ integrationId: row.integrationId, projectId });
      toast.success(t("settings:giteaIntegration.toast.issuesImported"));
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("settings:giteaIntegration.toast.importError"),
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
      toast.success(t("settings:giteaIntegration.toast.removed"));
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("settings:giteaIntegration.toast.removeError"),
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
          <GiteaConnectForm
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
      <GiteaAddRepositoryDialog
        projectId={projectId}
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
      />
      <GiteaRepositoryBrowserModal
        projectId={projectId}
        open={showFirstBindingBrowser}
        onOpenChange={(open) => {
          if (!open) {
            setAddError(null);
          }
          setShowFirstBindingBrowser(open);
        }}
        onSelectRepository={(repository) =>
          void handleFirstBindingSelect(repository)
        }
        baseUrl={firstBindingCredentials.baseUrl}
        accessToken={firstBindingCredentials.accessToken}
        addError={addError}
        onDismissError={() => setAddError(null)}
      />
    </div>
  );
}
