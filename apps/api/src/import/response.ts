import { IMPORT_SOURCE_IDS } from "@kaneo/importers";
import { nullableResponseTimestamp, responseTimestamp, z } from "../openapi";
import {
  IMPORT_RUN_PROJECT_STATUSES,
  IMPORT_RUN_STAGES,
  IMPORT_RUN_STATUSES,
} from "./import-run-project";

export const importSourceProjectSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    detail: z.string().optional().openapi({
      description:
        "Extra context shown next to the name, such as the source workspace or team.",
    }),
  })
  .openapi("ImportSourceProject");

export const importSourceProjectListSchema = z
  .object({ projects: z.array(importSourceProjectSchema) })
  .openapi("ImportSourceProjectList");

const importCountsSchema = z
  .object({
    columns: z.number().int(),
    tasks: z.number().int(),
    labels: z.number().int(),
    comments: z.number().int(),
    assignees: z.number().int().openapi({
      description: "Tasks that were assigned to a workspace member.",
    }),
    relations: z.number().int(),
    attachments: z.number().int().openapi({
      description:
        "Attachments copied into the storage backend and linked from the task descriptions.",
    }),
    sprints: z.number().int().openapi({
      description: "Sprints created by the import.",
    }),
    users: z.number().int().openapi({
      description:
        "People who were not workspace members yet and were invited or had an account created.",
    }),
  })
  .openapi("ImportCounts");

export const importRunProjectSchema = z
  .object({
    sourceId: z.string(),
    name: z.string(),
    status: z.enum(IMPORT_RUN_PROJECT_STATUSES),
    stage: z.enum(IMPORT_RUN_STAGES).openapi({
      description:
        "While running, the import step this project is on: reading the source, then sprints, users, and issues. done once completed.",
    }),
    projectId: z.string().nullable().openapi({
      description: "The Kaneo project created by the import, once completed.",
    }),
    projectSlug: z.string().nullable(),
    counts: importCountsSchema,
    warnings: z.array(z.string()),
    error: z.string().nullable(),
  })
  .openapi("ImportRunProject");

export const importRunSchema = z
  .object({
    id: z.string(),
    workspaceId: z.string(),
    source: z.enum(IMPORT_SOURCE_IDS),
    status: z.enum(IMPORT_RUN_STATUSES).openapi({
      description:
        "completed once every selected project was attempted, even if some failed; check each project's status. failed means the run itself stopped.",
    }),
    includeComments: z.boolean(),
    message: z.string().nullable().openapi({
      description: "Latest progress line while the run is running.",
    }),
    error: z.string().nullable(),
    projects: z.array(importRunProjectSchema),
    createdAt: responseTimestamp,
    finishedAt: nullableResponseTimestamp,
  })
  .openapi("ImportRun");

export const importRunEnvelopeSchema = z
  .object({ run: importRunSchema })
  .openapi("ImportRunEnvelope");

export const importRunListSchema = z
  .object({ runs: z.array(importRunSchema) })
  .openapi("ImportRunList");

export const trelloAuthorizeUrlSchema = z
  .object({
    authorizeUrl: z.string().nullable().openapi({
      description:
        "Trello page where the user approves read access for Kaneo and copies a token. null when the server has no TRELLO_API_KEY; the user then sends their own Trello API key with the token.",
    }),
  })
  .openapi("TrelloAuthorizeUrl");

export type ImportRunResponse = z.infer<typeof importRunSchema>;

export const jiraLinkRewriteSchema = z
  .object({
    dryRun: z.boolean().openapi({
      description: "true when nothing was written; false when the rewrite was applied.",
    }),
    replacements: z
      .array(
        z.object({
          sourceUrl: z.string().openapi({
            description: "The Jira issue link found in the text.",
          }),
          targetUrl: z.string().openapi({
            description: "The Kaneo task URL that replaces it.",
          }),
          targetTicketId: z.string().openapi({
            description: "Ticket ID of the imported task, e.g. ABC-1.",
          }),
          targetTitle: z.string().openapi({
            description: "Title of the imported task.",
          }),
          taskId: z.string().openapi({
            description:
              "The task whose description contains the link; same as commentId's task when commentId is set.",
          }),
          commentId: z.string().nullable().openapi({
            description: "The comment that contains the link, when it is not the description.",
          }),
        }),
      )
      .openapi({ description: "Every link that resolves to an imported task." }),
    unresolved: z
      .array(
        z.object({
          url: z.string(),
          taskId: z.string(),
          commentId: z.string().nullable(),
        }),
      )
      .openapi({
        description:
          "Links that point at a project or issue this workspace has no task for. They are left unchanged.",
      }),
    updatedTasks: z.number().int().openapi({
      description: "Tasks whose description changes. Planned when dryRun is true.",
    }),
    updatedComments: z.number().int().openapi({
      description: "Comments that change. Planned when dryRun is true.",
    }),
  })
  .openapi("JiraLinkRewrite");

export type ImportRunResponse = z.infer<typeof importRunSchema>;
