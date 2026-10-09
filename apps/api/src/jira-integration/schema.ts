import { z } from "../openapi";

const jiraCredentials = {
  projectId: z.string().min(1),
  baseUrl: z.url(),
  authMode: z.enum(["cloud", "dc"]).openapi({
    description:
      "cloud = Atlassian cloud with email + API token (Basic); dc = Jira Data Center with a personal access token (Bearer).",
  }),
};

export const listJiraProjectsBody = z.object({
  ...jiraCredentials,
  email: z.string().min(1).optional().openapi({
    description: "Atlassian account email; required for cloud authentication.",
  }),
  apiToken: z.string().min(1),
});

export const verifyJiraBody = z.object({
  ...jiraCredentials,
  email: z.string().min(1).optional(),
  apiToken: z.string().min(1).optional().openapi({
    description:
      "Omit to verify with this project's saved token. The base URL and auth mode must match the saved integration.",
  }),
  projectKey: z.string().min(1),
});

export const createJiraBody = z.object({
  baseUrl: z.string().min(1),
  authMode: z.enum(["cloud", "dc"]),
  email: z.string().optional().openapi({
    description: "Atlassian account email; required for cloud authentication.",
  }),
  apiToken: z.string().optional().openapi({
    description: "Omit to keep the token already stored for this project.",
  }),
  projectKey: z.string().min(1),
  issueType: z.string().min(1).optional().openapi({
    description:
      "Jira issue type created for new Kaneo tasks. Defaults to Task.",
  }),
  statusMap: z.record(z.string(), z.string()).optional().openapi({
    description:
      "Optional Kaneo column slug to Jira status name mapping for outbound transitions.",
  }),
});

export const updateJiraBody = z.object({
  isActive: z.boolean().optional(),
  commentTaskLinkOnJiraIssue: z.boolean().optional(),
  issueType: z.string().min(1).optional(),
  statusMap: z.record(z.string(), z.string()).optional(),
});

// Imports are keyed by the integration id of the binding.
export const importJiraBody = z.object({
  integrationId: z.string().min(1).max(128),
  // Compat: the old project-keyed body sent projectId; when present it must
  // match the binding's project (404 otherwise).
  projectId: z.string().min(1).max(128).optional(),
});
