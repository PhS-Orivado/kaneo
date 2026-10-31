import { ArrowUpRightIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { RepositoryPickerDialog } from "@/components/project/code-hosting/picker/repository-picker-dialog";
import { RepositoryPickerSearch } from "@/components/project/code-hosting/picker/repository-picker-search";
import { GithubRepositoryResults } from "@/components/project/github-integration/github-repository-results";
import { useGithubAppInfo } from "@/components/project/github-integration/use-github-app-info";
import { useGithubRepositorySearch } from "@/components/project/github-integration/use-github-repository-search";
import type { GithubRepository } from "@/fetchers/github-integration/list-repositories";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

type GithubRepositoryPickerProps = {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectRepositories: (repositories: { owner: string; name: string }[]) => void;
  selectedRepository?: string;
};

export function GithubRepositoryPicker({
  projectId,
  open,
  onOpenChange,
  onSelectRepositories,
  selectedRepository,
}: GithubRepositoryPickerProps) {
  const { t } = useTranslation();
  const [term, setTerm] = useState("");
  const [selected, setSelected] = useState<GithubRepository[]>([]);
  const search = useDebouncedValue(term.trim(), 300);
  const { data: appInfo } = useGithubAppInfo(open);
  const results = useGithubRepositorySearch({
    projectId,
    search,
    enabled: open,
  });
  // Keep the repository already typed into the setup panel usable without a
  // click, so confirming a single repository behaves exactly as before.
  const implicit =
    selected.length === 0 && selectedRepository
      ? results.repositories.find(
          (repository) => repository.full_name === selectedRepository,
        ) ?? null
      : null;
  const effective = selected.length > 0 ? selected : implicit ? [implicit] : [];
  const effectiveKeys = new Set(effective.map((repository) => repository.full_name));

  const changeOpen = (next: boolean) => {
    if (!next) {
      setTerm("");
      setSelected([]);
    }
    onOpenChange(next);
  };

  const toggle = (repository: GithubRepository) => {
    setSelected((current) =>
      current.some((item) => item.full_name === repository.full_name)
        ? current.filter((item) => item.full_name !== repository.full_name)
        : [...current, repository],
    );
  };

  const use = (list: GithubRepository[]) => {
    if (list.length === 0) return;
    onSelectRepositories(
      list.map((repository) => ({
        owner: repository.owner.login,
        name: repository.name,
      })),
    );
    changeOpen(false);
  };

  const useRepository = (repository: GithubRepository) => {
    use(effectiveKeys.has(repository.full_name) ? effective : [...effective, repository]);
  };

  return (
    <RepositoryPickerDialog
      open={open}
      onOpenChange={changeOpen}
      title={t("settings:repositoryBrowser.title")}
      description={t("settings:repositoryBrowser.description")}
      search={
        <RepositoryPickerSearch
          value={term}
          placeholder={t("settings:repositoryBrowser.searchPlaceholder")}
          onChange={setTerm}
        />
      }
      footerStart={
        <span className="flex flex-wrap items-center gap-1.5">
          {effective.length > 0
            ? t("settings:repositoryBrowser.selectedCount", {
                count: effective.length,
              })
            : null}
          {t("settings:repositoryBrowser.missingOne")}
          <a
            href="https://github.com/settings/installations"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-medium text-foreground hover:underline"
          >
            {t("settings:repositoryBrowser.manageAccess")}
            <ArrowUpRightIcon aria-hidden="true" className="size-3" />
          </a>
        </span>
      }
      confirmLabel={
        effective.length > 1
          ? t("settings:repositoryBrowser.useSelected")
          : t("settings:repositoryBrowser.useRepository")
      }
      confirmDisabled={effective.length === 0}
      onConfirm={() => use(effective)}
    >
      <GithubRepositoryResults
        repositories={results.repositories}
        searching={search !== ""}
        isPending={results.isPending}
        isError={results.isError}
        isFetchNextPageError={results.isFetchNextPageError}
        hasNextPage={results.hasNextPage}
        fetchingMore={results.fetchingMore}
        appName={appInfo?.appName}
        selectedKeys={effectiveKeys}
        onSelect={toggle}
        onConfirm={useRepository}
        onRetry={() => void results.refetch()}
        onLoadMore={() => void results.fetchNextPage()}
      />
    </RepositoryPickerDialog>
  );
}
