import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { filterByName } from "@/components/project/code-hosting/picker/filter-by-name";
import { RepositoryPickerDialog } from "@/components/project/code-hosting/picker/repository-picker-dialog";
import { RepositoryPickerSearch } from "@/components/project/code-hosting/picker/repository-picker-search";
import type { GitlabTokenType } from "@/components/project/gitlab-integration/gitlab-access";
import { GitlabProjectResults } from "@/components/project/gitlab-integration/gitlab-project-results";
import listGitlabProjects, {
  type ListGitlabProjectsResponse,
} from "@/fetchers/gitlab-integration/list-gitlab-projects";
import { tokenFingerprint } from "@/lib/token-fingerprint";

type GitlabProject = ListGitlabProjectsResponse["projects"][number];

type GitlabProjectPickerProps = {
  open: boolean;
  projectId: string;
  onOpenChange: (open: boolean) => void;
  onSelectProjects: (projectPaths: string[]) => void;
  selectedProjectPath?: string;
  baseUrl: string;
  accessToken: string;
  tokenType: GitlabTokenType;
};

export function GitlabProjectPicker({
  open,
  projectId,
  onOpenChange,
  onSelectProjects,
  selectedProjectPath,
  baseUrl,
  accessToken,
  tokenType,
}: GitlabProjectPickerProps) {
  const { t } = useTranslation();
  const [term, setTerm] = useState("");
  const [selected, setSelected] = useState<GitlabProject[]>([]);
  const canFetch =
    open && baseUrl.trim().length > 0 && accessToken.trim().length > 0;

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: [
      "gitlab-projects",
      projectId,
      baseUrl,
      tokenType,
      tokenFingerprint(accessToken),
    ],
    queryFn: () =>
      listGitlabProjects({ projectId, baseUrl, accessToken, tokenType }),
    enabled: canFetch,
    gcTime: 0,
  });

  const projects = filterByName(
    data?.projects ?? [],
    term,
    (project) => project.path_with_namespace,
  );
  // Keep the project already typed into the setup panel usable without a
  // click, so confirming a single project behaves exactly as before.
  const implicit =
    selected.length === 0 && selectedProjectPath
      ? data?.projects.find(
          (project) => project.path_with_namespace === selectedProjectPath,
        ) ?? null
      : null;
  const effective = selected.length > 0 ? selected : implicit ? [implicit] : [];
  const effectiveKeys = new Set(effective.map((project) => project.path_with_namespace));

  const changeOpen = (next: boolean) => {
    if (!next) {
      setTerm("");
      setSelected([]);
    }
    onOpenChange(next);
  };

  const toggle = (project: GitlabProject) => {
    setSelected((current) =>
      current.some(
        (item) => item.path_with_namespace === project.path_with_namespace,
      )
        ? current.filter(
            (item) =>
              item.path_with_namespace !== project.path_with_namespace,
          )
        : [...current, project],
    );
  };

  const use = (list: GitlabProject[]) => {
    if (list.length === 0) return;
    onSelectProjects(list.map((project) => project.path_with_namespace));
    changeOpen(false);
  };

  const useProject = (project: GitlabProject) => {
    use(effectiveKeys.has(project.path_with_namespace) ? effective : [...effective, project]);
  };

  return (
    <RepositoryPickerDialog
      open={open}
      onOpenChange={changeOpen}
      title={t("settings:codeHosting.chooseProjectTitle")}
      description={t("settings:gitlabIntegration.browseModalHint")}
      search={
        <RepositoryPickerSearch
          value={term}
          placeholder={t("settings:gitlabIntegration.searchProjects")}
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
          : t("settings:gitlabIntegration.useProject")
      }
      confirmDisabled={effective.length === 0 || !canFetch}
      onConfirm={() => use(effective)}
    >
      <GitlabProjectResults
        canFetch={canFetch}
        isLoading={isLoading}
        error={canFetch ? error : null}
        loaded={canFetch && Boolean(data)}
        projects={projects}
        searching={term.trim() !== ""}
        selectedKeys={effectiveKeys}
        onSelect={toggle}
        onConfirm={useProject}
        onRetry={() => void refetch()}
      />
    </RepositoryPickerDialog>
  );
}
