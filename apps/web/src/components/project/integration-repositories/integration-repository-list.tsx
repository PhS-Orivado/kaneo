import { AlertTriangle, Inbox } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  IntegrationRepositoryRow,
  type RepositoryRowActions,
} from "@/components/project/integration-repositories/integration-repository-row";
import { Button } from "@/components/ui/button";
import type { RepositoryBindingRow } from "@/types/repository-binding";

export type IntegrationRepositoryListProps = RepositoryRowActions & {
  rows: RepositoryBindingRow[];
  isLoading: boolean;
  error: Error | null;
  onRetry: () => void;
  /** Rendered instead of the rows while the project has no binding. */
  emptyContent?: ReactNode;
  /** Set of integration ids whose import mutation is running. */
  importingIds: ReadonlySet<string>;
};

// Skeleton rows match the final row layout so loading does not shift content.
function ListSkeleton() {
  return (
    <ul className="divide-y divide-border" aria-hidden="true">
      {[0, 1, 2].map((slot) => (
        <li key={`repository-skeleton-${slot}`} className="flex items-center gap-3 py-2.5">
          <div className="size-8 rounded-lg bg-muted animate-pulse" />
          <div className="flex-1 space-y-1.5">
            <div className="h-4 w-48 rounded bg-muted animate-pulse" />
            <div className="h-3 w-32 rounded bg-muted animate-pulse" />
          </div>
          <div className="h-5 w-16 rounded-full bg-muted animate-pulse" />
        </li>
      ))}
    </ul>
  );
}

export function IntegrationRepositoryList({
  rows,
  isLoading,
  error,
  onRetry,
  emptyContent,
  importingIds,
  ...actions
}: IntegrationRepositoryListProps) {
  const { t } = useTranslation();

  if (isLoading) {
    return <ListSkeleton />;
  }

  if (error) {
    return (
      <div
        role="alert"
        className="flex items-center justify-between gap-3 py-4"
      >
        <p className="flex items-center gap-2 text-sm text-destructive">
          <AlertTriangle className="size-4" />
          {t("settings:repositoryBindings.listError")}
        </p>
        <Button size="sm" type="button" variant="outline" onClick={() => onRetry()}>
          {t("common:error.tryAgain")}
        </Button>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <>
        {emptyContent ? (
          emptyContent
        ) : (
          <p className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <Inbox className="size-4" />
            {t("settings:repositoryBindings.listEmpty")}
          </p>
        )}
      </>
    );
  }

  return (
    <ul className="divide-y divide-border">
      {rows.map((row) => (
        <IntegrationRepositoryRow
          key={row.integrationId}
          row={row}
          isImporting={importingIds.has(row.integrationId)}
          {...actions}
        />
      ))}
    </ul>
  );
}
