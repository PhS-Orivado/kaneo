import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { filterByName } from "@/components/project/code-hosting/picker/filter-by-name";
import { RepositoryPickerDialog } from "@/components/project/code-hosting/picker/repository-picker-dialog";
import { RepositoryPickerSearch } from "@/components/project/code-hosting/picker/repository-picker-search";
import { GiteaRepositoryResults } from "@/components/project/gitea-integration/gitea-repository-results";
import listGiteaRepositories, {
  type ListGiteaRepositoriesResponse,
} from "@/fetchers/gitea-integration/list-gitea-repositories";
import { authClient } from "@/lib/auth-client";

type GiteaRepository = ListGiteaRepositoriesResponse["repositories"][number];

type GiteaRepositoryPickerProps = {
  open: boolean;
  projectId: string;
  onOpenChange: (open: boolean) => void;
  onSelectRepositories: (repositories: { owner: string; name: string }[]) => void;
  selectedRepository?: string;
  baseUrl: string;
  accessToken: string;
};

export function GiteaRepositoryPicker({
  open,
  projectId,
  onOpenChange,
  onSelectRepositories,
  selectedRepository,
  baseUrl,
  accessToken,
}: GiteaRepositoryPickerProps) {
  const { t } = useTranslation();
  const [term, setTerm] = useState("");
  const [selected, setSelected] = useState<GiteaRepository[]>([]);
  const { data: session } = authClient.useSession();
  const credentials = useMemo(
    () => ({ accessToken, cacheId: crypto.randomUUID() }),
    [accessToken],
  );
  const canFetch =
    open &&
    Boolean(session?.user.id) &&
    baseUrl.trim().length > 0 &&
    accessToken.trim().length > 0;

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: [
      "gitea-repositories",
      session?.user.id,
      projectId,
      baseUrl,
      credentials.cacheId,
    ],
    queryFn: () =>
      listGiteaRepositories({
        projectId,
        baseUrl,
        accessToken: credentials.accessToken,
      }),
    enabled: canFetch,
    gcTime: 0,
    placeholderData: () => undefined,
  });

  const repositories = filterByName(
    data?.repositories ?? [],
    term,
    (repository) => repository.full_name,
  );
  // Keep the repository already typed into the setup panel usable without a
  // click, so confirming a single repository behaves exactly as before.
  const implicit =
    selected.length === 0 && selectedRepository
      ? data?.repositories.find(
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

  const toggle = (repository: GiteaRepository) => {
    setSelected((current) =>
      current.some((item) => item.full_name === repository.full_name)
        ? current.filter((item) => item.full_name !== repository.full_name)
        : [...current, repository],
    );
  };

  const use = (list: GiteaRepository[]) => {
    if (list.length === 0) return;
    onSelectRepositories(
      list.map((repository) => ({
        owner: repository.owner.login,
        name: repository.name,
      })),
    );
    changeOpen(false);
  };

  const useRepository = (repository: GiteaRepository) => {
    use(effectiveKeys.has(repository.full_name) ? effective : [...effective, repository]);
  };

  return (
    <RepositoryPickerDialog
      open={open}
      onOpenChange={changeOpen}
      title={t("settings:codeHosting.chooseRepositoryTitle")}
      description={t("settings:giteaIntegration.browseModalHint")}
      search={
        <RepositoryPickerSearch
          value={term}
          placeholder={t("settings:repositoryBrowser.searchPlaceholder")}
          onChange={setTerm}
        />
      }
      footerStart={
        effective.length > 0
          ? t("settings:repositoryBrowser.selectedCount", {
              count: effective.length,
            })
          : undefined
      }
      confirmLabel={
        effective.length > 1
          ? t("settings:repositoryBrowser.useSelected")
          : t("settings:repositoryBrowser.useRepository")
      }
      confirmDisabled={effective.length === 0 || !canFetch}
      onConfirm={() => use(effective)}
    >
      <GiteaRepositoryResults
        canFetch={canFetch}
        isLoading={isLoading}
        error={canFetch ? error : null}
        loaded={canFetch && Boolean(data)}
        repositories={repositories}
        searching={term.trim() !== ""}
        selectedKeys={effectiveKeys}
        onSelect={toggle}
        onConfirm={useRepository}
        onRetry={() => void refetch()}
      />
    </RepositoryPickerDialog>
  );
}
