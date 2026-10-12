import { z } from "../openapi";

const repositoryRef = {
  repositoryOwner: z.string().min(1).max(100),
  repositoryName: z.string().min(1).max(100),
};

export const verifyGitHubBody = z.object({
  projectId: z.string().min(1),
  ...repositoryRef,
});

export const createGitHubBody = z.object(repositoryRef);

export const updateGitHubBody = z.object({
  isActive: z.boolean().optional(),
  commentTaskLinkOnGitHubIssue: z.boolean().optional(),
});

export const repositoryPageQuery = z.object({
  installationPage: z
    .string()
    .regex(/^[1-9][0-9]{0,5}$/)
    .default("1")
    .transform(Number),
  repositoryPage: z
    .string()
    .regex(/^[1-9][0-9]{0,5}$/)
    .default("1")
    .transform(Number),
});

export const importGitHubBody = z.object({
  // RFC 0001 WP2: imports are keyed by the integration id of the binding.
  integrationId: z.string().min(1).max(128),
  // Compat: the old project-keyed body sent projectId; when present it must
  // match the binding's project (404 otherwise).
  projectId: z.string().min(1).max(128).optional(),
  runId: z.string().min(1).max(128).optional(),
});

export const repositoryBranchesQuery = z.object({
  query: z.string().max(200).optional().openapi({
    description:
      "Case-insensitive substring filter applied to branch names server-side.",
  }),
});

export const createRepositoryBranchBody = z.object({
  taskId: z
    .string()
    .min(1)
    .max(128)
    .openapi({ description: "The task the branch is created for." }),
  branchName: z.string().min(1).max(255).openapi({
    description:
      "The branch to create, e.g. fix/EC-123. Must satisfy git ref name rules.",
  }),
  create: z.boolean().default(true).openapi({
    description:
      "Create the ref on GitHub from the default branch head when it does not exist yet. Set to false to only link an existing branch.",
  }),
});
