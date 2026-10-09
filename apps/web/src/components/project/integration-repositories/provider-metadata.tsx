import type { ComponentType, SVGProps } from "react";
import { GiteaIcon } from "@/components/icons/gitea-icon";
import { GithubIcon } from "@/components/icons/github-icon";
import { GitlabIcon } from "@/components/icons/gitlab-icon";
import { JiraIcon } from "@/components/icons/jira-icon";
import type { RepositoryProvider } from "@/types/repository-binding";

export type ProviderMetadata = {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  /** The provider's settings i18n namespace. */
  | "githubIntegration"
  | "giteaIntegration"
  | "gitlabIntegration"
  | "jiraIntegration";
  /** The list query key of the provider (RFC 0001 WP7). */
  listQueryKey:
    | "github-integrations"
    | "gitea-integrations"
    | "gitlab-integrations"
    | "jira-integrations";
};

export const PROVIDER_METADATA: Record<RepositoryProvider, ProviderMetadata> = {
  github: {
    icon: GithubIcon,
    namespace: "githubIntegration",
    listQueryKey: "github-integrations",
  },
  gitea: {
    icon: GiteaIcon,
    namespace: "giteaIntegration",
    listQueryKey: "gitea-integrations",
  },
  gitlab: {
    icon: GitlabIcon,
    namespace: "gitlabIntegration",
    listQueryKey: "gitlab-integrations",
  },
  jira: {
    icon: JiraIcon,
    namespace: "jiraIntegration",
    listQueryKey: "jira-integrations",
  },
};
