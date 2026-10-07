import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { GithubIcon } from "@/components/icons/github-icon";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import useCreateRepositoryBranch from "@/hooks/mutations/github-integration/use-create-repository-branch";
import useListRepositoryBranches from "@/hooks/queries/github-integration/use-list-repository-branches";
import type { ProjectRepositoryBinding } from "@/types/repository-binding";

type LinkBranchDialogProps = {
  open: boolean;
  onClose: () => void;
  taskId: string;
  githubBindings: ProjectRepositoryBinding[];
  /** Search prefill: the task's ticket key, e.g. EC-123. */
  defaultQuery: string;
  /** integrationId:branch keys already linked to the task. */
  linkedBranchKeys: Set<string>;
};

export function branchKey(integrationId: string, branchName: string): string {
  return `${integrationId}:${branchName}`;
}

/**
 * Search branch names across the project's linked repositories and link the
 * matching ones to the task. Prefills the search with the ticket key.
 */
export function LinkBranchDialog({
  open,
  onClose,
  taskId,
  githubBindings,
  defaultQuery,
  linkedBranchKeys,
}: LinkBranchDialogProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState(defaultQuery);
  const [debouncedQuery, setDebouncedQuery] = useState(defaultQuery);
  const createRepositoryBranch = useCreateRepositoryBranch();
  const [linking, setLinking] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setQuery(defaultQuery);
      setDebouncedQuery(defaultQuery);
    }
  }, [open, defaultQuery]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 400);
    return () => clearTimeout(timer);
  }, [query]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) onClose();
  };

  const handleLink = async (
    integrationId: string,
    branchName: string,
  ) => {
    setLinking(branchKey(integrationId, branchName));
    try {
      await createRepositoryBranch.mutateAsync({
        integrationId,
        taskId,
        branchName,
        create: false,
      });
    } finally {
      setLinking(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("tasks:branches.findTitle")}</DialogTitle>
          <DialogDescription>
            {t("tasks:branches.findDescription")}
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-4">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("tasks:branches.searchPlaceholder")}
            autoFocus
          />

          <div className="mt-4 space-y-4">
            {githubBindings.map((binding) => (
              <RepositoryBranchGroup
                key={binding.id}
                binding={binding}
                query={debouncedQuery}
                open={open}
                linkedBranchKeys={linkedBranchKeys}
                linking={linking}
                onLink={handleLink}
              />
            ))}
            {githubBindings.length === 0 && (
              <p className="text-sm text-muted-foreground">
                {t("tasks:branches.noGithubRepos")}
              </p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

type RepositoryBranchGroupProps = {
  binding: ProjectRepositoryBinding;
  query: string;
  open: boolean;
  linkedBranchKeys: Set<string>;
  linking: string | null;
  onLink: (integrationId: string, branchName: string) => void;
};

function RepositoryBranchGroup({
  binding,
  query,
  open,
  linkedBranchKeys,
  linking,
  onLink,
}: RepositoryBranchGroupProps) {
  const { t } = useTranslation();
  const { data, isLoading, isError } = useListRepositoryBranches(
    binding.id,
    query,
    open,
  );

  return (
    <div>
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <GithubIcon className="size-3.5 shrink-0" />
        <span className="truncate">{binding.identity}</span>
      </div>

      {isLoading ? (
        <p className="mt-2 text-sm text-muted-foreground">
          {t("common:empty.loading")}
        </p>
      ) : isError ? (
        <p className="mt-2 text-sm text-destructive">
          {t("tasks:branches.searchError")}
        </p>
      ) : (
        <div className="mt-2 space-y-1">
          {data?.branches.map((branch) => {
            const key = branchKey(binding.id, branch.name);
            const isLinked = linkedBranchKeys.has(key);
            return (
              <div
                key={branch.name}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent/50"
              >
                <span className="min-w-0 flex-1 truncate font-mono text-sm">
                  {branch.name}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isLinked || linking !== null}
                  onClick={() => onLink(binding.id, branch.name)}
                >
                  {linking === key
                    ? t("tasks:branches.linking")
                    : isLinked
                      ? t("tasks:branches.linked")
                      : t("tasks:branches.link")}
                </Button>
              </div>
            );
          })}
          {data?.branches.length === 0 && (
            <p className="px-2 py-1.5 text-sm text-muted-foreground">
              {t("tasks:branches.noMatches")}
            </p>
          )}
          {data?.hasMore && (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">
              {t("tasks:branches.moreResults")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
