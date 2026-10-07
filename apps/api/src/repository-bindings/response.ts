import { responseTimestamp, z } from "../openapi";

export const repositoryBindingSummarySchema = z
  .object({
    id: z.string().openapi({
      description:
        "The integration id. Pass it as syncIntegrationIds when creating a task.",
    }),
    type: z
      .enum(["github", "gitea", "gitlab"])
      .openapi({ description: "The git provider of the binding." }),
    identity: z.string().openapi({
      description:
        "owner/name for GitHub and Gitea, the full project path for GitLab.",
    }),
    host: z
      .string()
      .nullable()
      .openapi({
        description:
          "Instance host for self-hosted Gitea and GitLab; null for github.com.",
      }),
    externalUrl: z
      .string()
      .openapi({ description: "Web URL of the repository." }),
    isActive: z.boolean(),
    requiresVerification: z.boolean().openapi({
      description:
        "Legacy GitHub bindings without a verified numeric repository id cannot create issues.",
    }),
    createdAt: responseTimestamp,
  })
  .openapi("RepositoryBindingSummary");

export const repositoryBindingListSchema = z
  .object({
    bindings: z
      .array(repositoryBindingSummarySchema)
      .openapi({ description: "Every repository binding of the project." }),
  })
  .openapi("RepositoryBindingList");
