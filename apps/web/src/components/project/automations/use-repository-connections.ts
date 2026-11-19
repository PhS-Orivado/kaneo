import {
  formatRepository,
  getIntegrationStatus,
  type IntegrationStatus,
} from "@/components/project/integrations/get-integration-status";
import {
  REPOSITORY_PROVIDERS,
  type RepositoryProvider,
} from "@/components/project/automations/repository-providers";
import useGetGiteaIntegrations from "@/hooks/queries/gitea-integration/use-get-gitea-integrations";
import useGetGithubIntegrations from "@/hooks/queries/github-integration/use-get-github-integrations";
import useGetGitlabIntegrations from "@/hooks/queries/gitlab-integration/use-get-gitlab-integrations";

export type RepositoryConnection = RepositoryProvider & {
  status: IntegrationStatus;
};

// One binding shows its repository; several bindings show the first plus
// the remaining count, so a provider with multiple bindings never reads as
// a single repository.
function summarizeBindings(
  labels: (string | undefined)[],
): string | undefined {
  const first = labels.find((label) => label?.trim());
  if (!first) return undefined;
  return labels.length > 1 ? `${first} +${labels.length - 1}` : first;
}

export function useRepositoryConnections(
  projectId: string,
): RepositoryConnection[] {
  // RFC 0001 WP3: a project binds one integration row per repository, so
  // the provider status aggregates every binding instead of the legacy
  // compat single-binding queries, which answered for an arbitrary first
  // row: a project with one active and one paused binding stays connected
  // here instead of flipping when row order changes.
  const github = useGetGithubIntegrations(projectId);
  const gitea = useGetGiteaIntegrations(projectId);
  const gitlab = useGetGitlabIntegrations(projectId);

  const githubBindings = github.data?.integrations ?? [];
  const giteaBindings = gitea.data?.integrations ?? [];
  const gitlabBindings = gitlab.data?.integrations ?? [];

  const statuses = {
    github: getIntegrationStatus({
      queryStatus: github.status,
      hasData: github.data !== undefined,
      configured: githubBindings.length > 0,
      isActive: githubBindings.some((binding) => binding.isActive),
      detail: summarizeBindings(
        githubBindings.map((binding) =>
          formatRepository(binding.repositoryOwner, binding.repositoryName),
        ),
      ),
    }),
    gitea: getIntegrationStatus({
      queryStatus: gitea.status,
      hasData: gitea.data !== undefined,
      configured: giteaBindings.length > 0,
      isActive: giteaBindings.some((binding) => binding.isActive),
      detail: summarizeBindings(
        giteaBindings.map((binding) =>
          formatRepository(binding.repositoryOwner, binding.repositoryName),
        ),
      ),
    }),
    gitlab: getIntegrationStatus({
      queryStatus: gitlab.status,
      hasData: gitlab.data !== undefined,
      configured: gitlabBindings.length > 0,
      isActive: gitlabBindings.some((binding) => binding.isActive),
      detail: summarizeBindings(
        gitlabBindings.map((binding) => binding.projectPath ?? undefined),
      ),
    }),
  };

  return REPOSITORY_PROVIDERS.map((provider) => ({
    ...provider,
    status: statuses[provider.id],
  }));
}
