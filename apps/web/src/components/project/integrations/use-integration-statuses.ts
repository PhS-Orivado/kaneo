import {
  formatChannel,
  formatRepository,
  getIntegrationStatus,
} from "@/components/project/integrations/get-integration-status";
import type { IntegrationId } from "@/components/project/integrations/integration-definitions";
import useGetDiscordIntegration from "@/hooks/queries/discord-integration/use-get-discord-integration";
import useGetGenericWebhookIntegration from "@/hooks/queries/generic-webhook-integration/use-get-generic-webhook-integration";
import useListGiteaIntegrations from "@/hooks/queries/gitea-integration/use-list-gitea-integrations";
import useListGithubIntegrations from "@/hooks/queries/github-integration/use-list-github-integrations";
import useListGitlabIntegrations from "@/hooks/queries/gitlab-integration/use-list-gitlab-integrations";
import useGetMattermostIntegration from "@/hooks/queries/mattermost-integration/use-get-mattermost-integration";
import useGetSlackIntegration from "@/hooks/queries/slack-integration/use-get-slack-integration";
import useGetTelegramIntegration from "@/hooks/queries/telegram-integration/use-get-telegram-integration";

// RFC 0001 WP7: the git providers are multi-binding surfaces, so the list
// result drives the status: configured means the project has at least one
// repository binding, active means at least one binding is active, and the
// details list every bound repository. Shares query keys with the settings
// panels, so opening a panel reuses what the list already loaded.
export function useIntegrationStatuses(projectId: string) {
  const github = useListGithubIntegrations(projectId);
  const gitea = useListGiteaIntegrations(projectId);
  const gitlab = useListGitlabIntegrations(projectId);
  const slack = useGetSlackIntegration(projectId);
  const discord = useGetDiscordIntegration(projectId);
  const mattermost = useGetMattermostIntegration(projectId);
  const telegram = useGetTelegramIntegration(projectId);
  const webhook = useGetGenericWebhookIntegration(projectId);

  const githubBindings = github.data?.integrations ?? [];
  const giteaBindings = gitea.data?.integrations ?? [];
  const gitlabBindings = gitlab.data?.integrations ?? [];

  const statuses = {
    github: getIntegrationStatus({
      queryStatus: github.status,
      hasData: github.data !== undefined,
      configured: githubBindings.length > 0,
      isActive:
        githubBindings.length > 0
          ? githubBindings.some((binding) => binding.isActive !== false)
          : null,
      details: githubBindings.map((binding) =>
        formatRepository(binding.repositoryOwner, binding.repositoryName),
      ),
    }),
    gitea: getIntegrationStatus({
      queryStatus: gitea.status,
      hasData: gitea.data !== undefined,
      configured: giteaBindings.length > 0,
      isActive:
        giteaBindings.length > 0
          ? giteaBindings.some((binding) => binding.isActive !== false)
          : null,
      details: giteaBindings.map((binding) =>
        formatRepository(binding.repositoryOwner, binding.repositoryName),
      ),
    }),
    gitlab: getIntegrationStatus({
      queryStatus: gitlab.status,
      hasData: gitlab.data !== undefined,
      configured: gitlabBindings.length > 0,
      isActive:
        gitlabBindings.length > 0
          ? gitlabBindings.some((binding) => binding.isActive !== false)
          : null,
      details: gitlabBindings.map((binding) => binding.projectPath),
    }),
    slack: getIntegrationStatus({
      queryStatus: slack.status,
      hasData: slack.data !== undefined,
      configured: Boolean(slack.data?.webhookConfigured),
      isActive: slack.data?.isActive,
      detail: formatChannel(slack.data?.channelName),
    }),
    discord: getIntegrationStatus({
      queryStatus: discord.status,
      hasData: discord.data !== undefined,
      configured: Boolean(discord.data?.webhookConfigured),
      isActive: discord.data?.isActive,
      detail: formatChannel(discord.data?.channelName),
    }),
    mattermost: getIntegrationStatus({
      queryStatus: mattermost.status,
      hasData: mattermost.data !== undefined,
      configured: Boolean(mattermost.data?.webhookConfigured),
      isActive: mattermost.data?.isActive,
      detail: formatChannel(mattermost.data?.channelName),
    }),
    telegram: getIntegrationStatus({
      queryStatus: telegram.status,
      hasData: telegram.data !== undefined,
      configured: Boolean(telegram.data?.botTokenConfigured),
      isActive: telegram.data?.isActive,
      detail: telegram.data?.chatLabel,
    }),
    webhook: getIntegrationStatus({
      queryStatus: webhook.status,
      hasData: webhook.data !== undefined,
      configured: Boolean(webhook.data?.webhookConfigured),
      isActive: webhook.data?.isActive,
    }),
  };
  const queries = {
    github,
    gitea,
    gitlab,
    slack,
    discord,
    mattermost,
    telegram,
    webhook,
  };

  return {
    statuses,
    retry: (id: IntegrationId) => {
      void queries[id].refetch();
    },
  };
}
