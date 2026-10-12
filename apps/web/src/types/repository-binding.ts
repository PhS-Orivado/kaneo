import { z } from "zod/v4";

// RFC 0001 WP7: shared shapes of the repository binding list responses of the
// three git providers. The zod schemas are the single source of truth for the
// list fetchers, the hooks and the settings components, so the list and the
// detail shapes cannot drift apart.

export type RepositoryProvider = "github" | "gitea" | "gitlab";

/** RFC 0001 WP10: usage summary returned with every binding list. */
export const repositoryBindingUsageSchema = z.object({
  used: z.number(),
  // null = the plan has no repository limit.
  limit: z.number().nullable(),
});
export type RepositoryBindingUsage = z.infer<
  typeof repositoryBindingUsageSchema
>;

/** RFC 0001: linked-state annotation of listed provider repositories. */
export const repositoryLinkedToSchema = z.object({
  integrationId: z.string(),
  projectId: z.string(),
  projectName: z.string().nullable(),
});
export type RepositoryLinkedTo = z.infer<typeof repositoryLinkedToSchema>;

export const importProgressSchema = z.object({
  runId: z.string(),
  pending: z.boolean(),
  imported: z.number(),
  updated: z.number(),
  skipped: z.number(),
});
export type ImportProgress = z.infer<typeof importProgressSchema>;

export const githubBindingSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  repositoryOwner: z.string(),
  repositoryName: z.string(),
  installationId: z.number().nullable(),
  requiresVerification: z.boolean(),
  importProgress: importProgressSchema.optional(),
  branchPattern: z.string().optional(),
  commentTaskLinkOnGitHubIssue: z.boolean().optional(),
  isActive: z.boolean().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type GithubBinding = z.infer<typeof githubBindingSchema>;

export const giteaBindingSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  baseUrl: z.string(),
  repositoryOwner: z.string(),
  repositoryName: z.string(),
  maskedAccessToken: z.string(),
  webhookUrl: z.string().optional(),
  webhookSecret: z.string().optional(),
  branchPattern: z.string().optional(),
  commentTaskLinkOnGiteaIssue: z.boolean().optional(),
  isActive: z.boolean().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type GiteaBinding = z.infer<typeof giteaBindingSchema>;

export const gitlabBindingSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  baseUrl: z.string(),
  projectPath: z.string(),
  tokenType: z.enum(["private", "bearer"]),
  maskedAccessToken: z.string(),
  webhookUrl: z.string().optional(),
  webhookSecret: z.string().optional(),
  branchPattern: z.string().optional(),
  commentTaskLinkOnGitlabIssue: z.boolean().optional(),
  isActive: z.boolean().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type GitlabBinding = z.infer<typeof gitlabBindingSchema>;

export const githubBindingListSchema = z.object({
  integrations: z.array(githubBindingSchema),
  usage: repositoryBindingUsageSchema,
});

export const giteaBindingListSchema = z.object({
  integrations: z.array(giteaBindingSchema),
  usage: repositoryBindingUsageSchema,
});

export const gitlabBindingListSchema = z.object({
  integrations: z.array(gitlabBindingSchema),
  usage: repositoryBindingUsageSchema,
});

/** Minimal binding summary every workspace member may read. */
export const projectRepositoryBindingSchema = z.object({
  id: z.string(),
  type: z.enum(["github", "gitea", "gitlab"]),
  identity: z.string(),
  host: z.string().nullable(),
  externalUrl: z.string(),
  isActive: z.boolean(),
  requiresVerification: z.boolean(),
  createdAt: z.string(),
});
export type ProjectRepositoryBinding = z.infer<
  typeof projectRepositoryBindingSchema
>;

export const projectRepositoryBindingListSchema = z.object({
  bindings: z.array(projectRepositoryBindingSchema),
});

/**
 * Normalized row shape shared by the settings list of every provider. The
 * provider-specific binding is denormalized once during render, so the shared
 * row component stays identical for all three providers.
 */
export type RepositoryBindingRow = {
  provider: RepositoryProvider;
  integrationId: string;
  /** owner/name (GitHub, Gitea) or the full project path (GitLab). */
  identity: string;
  /** Instance host for Gitea and GitLab; null for GitHub. */
  host: string | null;
  externalUrl: string;
  isActive: boolean;
  /** Legacy GitHub bindings without a verified numeric repository id. */
  requiresVerification: boolean;
  importProgress?: ImportProgress;
  commentTaskLink: boolean;
  webhookUrl?: string;
  /** Only present for callers with workspace:manage_settings. */
  webhookSecret?: string;
  maskedAccessToken?: string;
};

function trimTrailingSlash(url: string) {
  return url.replace(/\/+$/, "");
}

export function toGithubBindingRow(
  binding: GithubBinding,
): RepositoryBindingRow {
  return {
    provider: "github",
    integrationId: binding.id,
    identity: `${binding.repositoryOwner}/${binding.repositoryName}`,
    host: null,
    externalUrl: `https://github.com/${binding.repositoryOwner}/${binding.repositoryName}`,
    isActive: binding.isActive !== false,
    requiresVerification: binding.requiresVerification,
    importProgress: binding.importProgress,
    commentTaskLink: binding.commentTaskLinkOnGitHubIssue !== false,
  };
}

export function toGiteaBindingRow(binding: GiteaBinding): RepositoryBindingRow {
  return {
    provider: "gitea",
    integrationId: binding.id,
    identity: `${binding.repositoryOwner}/${binding.repositoryName}`,
    host: trimTrailingSlash(binding.baseUrl),
    externalUrl: `${trimTrailingSlash(binding.baseUrl)}/${binding.repositoryOwner}/${binding.repositoryName}`,
    isActive: binding.isActive !== false,
    requiresVerification: false,
    commentTaskLink: binding.commentTaskLinkOnGiteaIssue !== false,
    webhookUrl: binding.webhookUrl,
    webhookSecret: binding.webhookSecret,
    maskedAccessToken: binding.maskedAccessToken,
  };
}

export function toGitlabBindingRow(
  binding: GitlabBinding,
): RepositoryBindingRow {
  return {
    provider: "gitlab",
    integrationId: binding.id,
    identity: binding.projectPath,
    host: trimTrailingSlash(binding.baseUrl),
    externalUrl: `${trimTrailingSlash(binding.baseUrl)}/${binding.projectPath}`,
    isActive: binding.isActive !== false,
    requiresVerification: false,
    commentTaskLink: binding.commentTaskLinkOnGitlabIssue !== false,
    webhookUrl: binding.webhookUrl,
    webhookSecret: binding.webhookSecret,
    maskedAccessToken: binding.maskedAccessToken,
  };
}
