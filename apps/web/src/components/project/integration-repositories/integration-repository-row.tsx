import {
  CheckCircle,
  ExternalLink,
  Filter,
  Import,
  MoreHorizontal,
  PauseCircle,
  Settings,
  ShieldQuestion,
  Unlink,
  Workflow,
} from "lucide-react";
import { memo } from "react";
import { useTranslation } from "react-i18next";
import { PROVIDER_METADATA } from "@/components/project/integration-repositories/provider-metadata";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/menu";
import type { RepositoryBindingRow } from "@/types/repository-binding";

export type RepositoryRowActions = {
  onOpenSettings: (row: RepositoryBindingRow) => void;
  onOpenSyncRules: (row: RepositoryBindingRow) => void;
  onOpenWorkflowRules: (row: RepositoryBindingRow) => void;
  onImportIssues: (row: RepositoryBindingRow) => void;
  onDisconnect: (row: RepositoryBindingRow) => void;
};

type IntegrationRepositoryRowProps = RepositoryRowActions & {
  row: RepositoryBindingRow;
  isImporting: boolean;
  /** True when imports are unavailable for this row (permissions, verification). */
  isImportDisabled: boolean;
};

// Module-scope menu component so a keystroke in one row cannot re-create the
// menu of another row (rerender-no-inline-components).
function RepositoryRowMenu({
  row,
  actions,
  isImporting,
  isImportDisabled,
}: {
  row: RepositoryBindingRow;
  actions: RepositoryRowActions;
  isImporting: boolean;
  isImportDisabled: boolean;
}) {
  const { t } = useTranslation();
  const close = (action: (row: RepositoryBindingRow) => void) => () =>
    action(row);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label={t("settings:repositoryBindings.rowMenuLabel", {
              repository: row.identity,
            })}
            size="icon"
            variant="ghost"
          />
        }
      >
        <MoreHorizontal className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem onClick={close(actions.onOpenSettings)}>
          <Settings className="size-3.5" />
          {t("settings:repositoryBindings.actionSettings")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={close(actions.onOpenSyncRules)}>
          <Filter className="size-3.5" />
          {t("settings:repositoryBindings.actionSyncRules")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={close(actions.onOpenWorkflowRules)}>
          <Workflow className="size-3.5" />
          {t("settings:repositoryBindings.actionWorkflowRules")}
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={isImporting || isImportDisabled}
          onClick={close(actions.onImportIssues)}
        >
          <Import className="size-3.5" />
          {t("settings:repositoryBindings.actionImportIssues")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onClick={close(actions.onDisconnect)}
        >
          <Unlink className="size-3.5" />
          {t("settings:repositoryBindings.actionDisconnect")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Status chips expose their meaning as text, not color alone (RFC 0001 WP7
// section 8). Derived during render; no effect writes them back.
function RepositoryStatusChips({ row }: { row: RepositoryBindingRow }) {
  const { t } = useTranslation();

  if (row.requiresVerification) {
    return (
      <Badge variant="outline" className="gap-1">
        <ShieldQuestion className="size-3" />
        {t("settings:repositoryBindings.statusNeedsVerification")}
      </Badge>
    );
  }
  if (!row.isActive) {
    return (
      <Badge variant="outline" className="gap-1">
        <PauseCircle className="size-3" />
        {t("settings:repositoryBindings.statusPaused")}
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="gap-1">
      <CheckCircle className="size-3" />
      {t("settings:repositoryBindings.statusActive")}
    </Badge>
  );
}

function IntegrationRepositoryRowImpl({
  row,
  isImporting,
  isImportDisabled,
  ...actions
}: IntegrationRepositoryRowProps) {
  const { t } = useTranslation();
  const Icon = PROVIDER_METADATA[row.provider].icon;

  return (
    <li className="flex items-center gap-3 py-2.5">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-background">
        <Icon aria-hidden="true" className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{row.identity}</span>
          {row.host ? (
            <span className="truncate font-mono text-xs text-muted-foreground">
              {row.host}
            </span>
          ) : null}
          <a
            href={row.externalUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t("settings:repositoryBindings.openRepository", {
              repository: row.identity,
            })}
            className="text-primary hover:text-primary/80 transition-colors"
          >
            <ExternalLink className="size-3" />
          </a>
        </div>
        {row.importProgress ? (
          <p className="truncate text-xs text-muted-foreground">
            {t("settings:repositoryBindings.importMeta", {
              imported: row.importProgress.imported,
              updated: row.importProgress.updated,
              skipped: row.importProgress.skipped,
            })}
          </p>
        ) : null}
      </div>
      <RepositoryStatusChips row={row} />
      <RepositoryRowMenu
        row={row}
        actions={actions}
        isImporting={isImporting}
        isImportDisabled={isImportDisabled}
      />
    </li>
  );
}

// Memoized: the list may grow to dozens of bindings and must not re-render
// every row when one row's import state changes (rerender-memo).
export const IntegrationRepositoryRow = memo(IntegrationRepositoryRowImpl);
