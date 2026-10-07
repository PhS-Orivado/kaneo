import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { GithubIcon } from "@/components/icons/github-icon";
import { BindingSettingsDialog } from "@/components/project/integration-repositories/binding-settings-dialog";
import { BindingSyncRulesDialog } from "@/components/project/integration-repositories/binding-sync-rules-dialog";
import { BindingWorkflowRulesDialog } from "@/components/project/integration-repositories/binding-workflow-rules-dialog";
import { DisconnectIntegrationDialog } from "@/components/project/integration-repositories/disconnect-integration-dialog";
import {
  parseAddBindingError,
  type AddBindingError,
} from "@/components/project/integration-repositories/add-binding-error";
import { GithubConnectForm } from "@/components/project/integration-repositories/github-connect-form";
import { IntegrationRepositoryList } from "@/components/project/integration-repositories/integration-repository-list";
import { RepositoryUsageBadge } from "@/components/project/integration-repositories/repository-usage-badge";
import { RepositoryBrowserModal } from "@/components/project/repository-browser-modal";
import { Button } from "@/components/ui/button";
import getGitHubAppInfo from "@/fetchers/github-integration/get-app-info";
import {
  useCreateGithubIntegration,
  useDeleteGithubIntegration,
} from "@/hooks/mutations/github-integration/use-create-github-integration";
import useImportGithubIssues from "@/hooks/mutations/github-integration/use-import-github-issues";
import { useUpdateGithubIntegration } from "@/hooks/mutations/github-integration/use-update-github-integration";
import useListGithubIntegrations from "@/hooks/queries/github-integration/use-list-github-integrations";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { authClient } from "@/lib/auth-client";
import { toast } from "@/lib/toast";
import {
  toGithubBindingRow,
  type RepositoryBindingRow,
} from "@/types/repository-binding";

/**
 * RFC 0001 WP7: the GitHub settings surface lists every repository binding of
 * the project. The first binding is created through the connect form or the
 * repository browser; further bindings are added from the same browser, and
 * every row manages its own settings, sync rules, workflow rules and import.
 */
export function GitHubIntegrationSettings({
  projectId,
}: {
  projectId: string;
}) {
  const { t } = useTranslation();
  const { canCreateTasks, canUpdateTasks } = useWorkspacePermission();
  const hasImportPermission = canCreateTasks() && canUpdateTasks();
  const { data: session } = authClient.useSession();
  const { data: appInfo } = useQuery({
    queryKey: ["github-app-info", session?.user.id],
    queryFn: getGitHubAppInfo,
    enabled: Boolean(session?.user.id),
  });

  const {
    data: list,
    isLoading,
    error,
    refetch,
  } = useListGithubIntegrations(projectId);
  const rows = useMemo(
    () => (list?.integrations ?? []).map(toGithubBindingRow),
    [list],
  );

  const { mutateAsync: createIntegration, isPending: isCreating } =
    useCreateGithubIntegration();
  const { mutateAsync: deleteIntegration, isPending: isDisconnecting } =
    useDeleteGithubIntegration();
  const { mutateAsync: updateSettings, isPending: isUpdatingSettings } =
    useUpdateGithubIntegration();
  const { mutateAsync: importIssues } = useImportGithubIssues();

  const [isLinkingAccount, setIsLinkingAccount] = useState(false);
  const [showBrowser, setShowBrowser] = useState(false);
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
  // (rerender-memo); legacy bindings without a verified installation and
  // members without task permissions cannot start an import.
  const isImportDisabled = useCallback(
    (row: RepositoryBindingRow) =>
      !hasImportPermission || row.requiresVerification,
    [hasImportPermission],
  );

  const linkAccount = async () => {
    setIsLinkingAccount(true);
    try {
      const result = await authClient.linkSocial({
        provider: "github",
        callbackURL: window.location.href,
      });
      if (result.error) throw new Error(result.error.message);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("settings:githubIntegration.toast.updateError"),
      );
    } finally {
      setIsLinkingAccount(false);
    }
  };

  // RFC 0001 D2: a failed add keeps the browser open; the server's own
  // blocker message (plan limit 402, duplicate 409) is shown inline.
  const handleBrowserSelect = async (repository: {
    owner: string;
    name: string;
  }) => {
    try {
      await createIntegration({
        projectId,
        data: {
          repositoryOwner: repository.owner,
          repositoryName: repository.name,
        },
      });
      setAddError(null);
      setShowBrowser(false);
      toast.success(t("settings:githubIntegration.toast.updated"));
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
        json: { commentTaskLinkOnGitHubIssue: checked },
      });
      toast.success(
        checked
          ? t("settings:githubIntegration.toast.commentOnEnabled")
          : t("settings:githubIntegration.toast.commentOnDisabled"),
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("settings:githubIntegration.toast.settingsUpdateError"),
      );
    }
  };

  const handleImportIssues = async (row: RepositoryBindingRow) => {
    if (!hasImportPermission) return;
    if (row.requiresVerification) {
      toast.warning(t("settings:githubIntegration.reverifyHint"));
      return;
    }
    setImportingIds((current) => new Set(current).add(row.integrationId));
    try {
      const result = await importIssues({
        integrationId: row.integrationId,
        projectId,
        ...(row.importProgress?.pending
          ? { runId: row.importProgress.runId }
          : {}),
      });
      toast.success(t("settings:githubIntegration.toast.issuesImported"), {
        description: t("settings:githubIntegration.importSummary", result),
      });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("settings:githubIntegration.toast.importError"),
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
      toast.success(t("settings:githubIntegration.toast.removed"));
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("settings:githubIntegration.toast.removeError"),
      );
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="space-y-4 rounded-xl border border-border bg-card p-4">
          <div className="h-4 w-40 animate-pulse rounded bg-muted" />
          <div className="h-10 w-full animate-pulse rounded bg-muted" />
        </div>
        <div className="space-y-4 rounded-xl border border-border bg-card p-4">
          <div className="h-4 w-40 animate-pulse rounded bg-muted" />
          <div className="h-10 w-full animate-pulse rounded bg-muted" />
          <div className="h-10 w-full animate-pulse rounded bg-muted" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {appInfo && !appInfo.accountConnected && (
        <div className="space-y-3 rounded-xl border border-border bg-card p-4">
          <p className="text-sm">
            {t("settings:githubIntegration.accountVerificationHint")}
          </p>
          {appInfo.accountLinkingAvailable ? (
            <Button
              type="button"
              variant="outline"
              loading={isLinkingAccount}
              onClick={linkAccount}
            >
              <GithubIcon aria-hidden="true" />
              {t("settings:githubIntegration.connect")} GitHub
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t("settings:githubIntegration.enableGithubSignInHint")}
            </p>
          )}
        </div>
      )}

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
          <GithubConnectForm
            projectId={projectId}
            onOpenBrowser={() => setShowBrowser(true)}
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
              onClick={() => {
                setAddError(null);
                setShowBrowser(true);
              }}
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
      <BindingSyncRulesDialog row={syncRulesRow} onClose={() => setSyncRulesRow(null)} />
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
      <RepositoryBrowserModal
        projectId={projectId}
        open={showBrowser}
        onOpenChange={(open) => {
          if (!open) {
            setAddError(null);
          }
          setShowBrowser(open);
        }}
        onSelectRepository={(repository) =>
          void handleBrowserSelect(repository)
        }
        addError={addError}
        onDismissError={() => setAddError(null)}
      />
    </div>
  );
}
