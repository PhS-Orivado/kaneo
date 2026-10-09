import { responseTimestamp, z } from "../openapi";
import {
  repositoryBindingUsageSchema,
  repositoryLinkedToSchema,
} from "../integrations/response";

// Credentials are only ever returned masked; the webhook secret goes only to
// callers holding workspace:manage_settings.
export const jiraIntegrationSchema = z
  .object({
    id: z.string(),
    projectId: z.string(),
    baseUrl: z
      .string()
      .openapi({ description: "Root URL of the Jira instance." }),
    authMode: z.enum(["cloud", "dc"]),
    email: z.string().optional(),
    projectKey: z.string(),
    maskedApiToken: z.string(),
    webhookUrl: z.string().optional().openapi({
      description: "Where Jira should POST events for this project.",
    }),
    webhookSecret: z.string().optional().openapi({
      description:
        "Only returned to callers with workspace:manage_settings, so the value can be pasted into Jira.",
    }),
    issueType: z.string().optional().openapi({
      description: "Issue type used for tasks created in Kaneo.",
    }),
    statusMap: z.record(z.string(), z.string()).optional().openapi({
      description:
        "Kaneo column slug to Jira status name mapping for outbound transitions.",
    }),
    commentTaskLinkOnJiraIssue: z.boolean().optional().openapi({
      description:
        "When on, Kaneo comments a link back to the task on the linked Jira issue.",
    }),
    isActive: z.boolean().nullable(),
    createdAt: responseTimestamp,
    updatedAt: responseTimestamp,
  })
  .openapi("JiraIntegration");

// List response of the project's Jira bindings with the workspace's
// repository binding usage summary.
export const jiraIntegrationListSchema = z
  .object({
    integrations: z.array(jiraIntegrationSchema).openapi({
      description: "Every Jira binding of the project, oldest first.",
    }),
    usage: repositoryBindingUsageSchema,
  })
  .openapi("JiraIntegrationList");

export const jiraProjectSchema = z
  .object({
    id: z.string(),
    key: z.string(),
    name: z.string(),
    linkedTo: repositoryLinkedToSchema.nullable().openapi({
      description: "The binding this project is already linked to, if any.",
    }),
  })
  .openapi("JiraProject");

export const jiraProjectListSchema = z
  .object({ projects: z.array(jiraProjectSchema) })
  .openapi("JiraProjectList");

export const jiraVerificationResultSchema = z
  .object({
    isInstalled: z.boolean(),
    hasRequiredPermissions: z.boolean(),
    projectExists: z.boolean(),
    missingPermissions: z.array(z.string()),
    message: z.string().openapi({
      description: "A human-readable summary to show the user.",
    }),
    failureReason: z
      .enum(["not_a_jira_instance", "redirected", "project_not_found"])
      .nullable()
      .openapi({
        description:
          "Why verification failed, when it did. `redirected` usually means the base URL is behind a proxy that rewrites it.",
      }),
  })
  .openapi("JiraVerificationResult");

export const jiraImportResultSchema = z
  .object({
    imported: z.number(),
    updated: z.number().openapi({
      description: "Existing tasks that were refreshed from their issue.",
    }),
    skipped: z.number(),
    relations: z.number().openapi({
      description:
        "Task relations created between imported tasks (subtask, blocks, related).",
    }),
    users: z
      .object({
        invited: z.number().openapi({
          description:
            "Jira users who now have a pending workspace invitation; no email was sent.",
        }),
        members: z.number().openapi({
          description: "Jira users who were already workspace members.",
        }),
        withoutEmail: z.array(z.string()).openapi({
          description:
            "Jira users without a public email address, who cannot be invited automatically.",
        }),
      })
      .openapi({
        description: "Jira users seen during the import and their invite state.",
      }),
    errors: z.array(z.string()).optional(),
  })
  .openapi("JiraImportResult");

export const jiraDeleteResultSchema = z
  .object({ success: z.boolean(), message: z.string() })
  .openapi("JiraDeleteResult");

export const integrationNotFoundSchema = z
  .object({ error: z.string() })
  .openapi("JiraIntegrationNotFound");
