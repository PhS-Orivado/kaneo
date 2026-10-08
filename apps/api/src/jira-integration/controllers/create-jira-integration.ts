import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import db from "../../database";
import { integrationTable, projectTable } from "../../database/schema";
import { mapIntegrationUniqueViolation } from "../../integrations/map-unique-violation";
import { assertRepositoryBindingQuota } from "../../plan-limits/repository-binding-quota";
import {
  type JiraConfig,
  getDefaultJiraConfig,
  validateJiraConfig,
} from "../../plugins/jira/config";
import {
  createJiraClient,
  JiraApiError,
  verifyJiraToken,
} from "../../plugins/jira/utils/jira-api";

import { resolveVerificationToken } from "./resolve-verification-token";

// One integration row per Jira project. Same-project duplicates are rejected
// by integration_project_type_repo_unique; the same Jira project may be
// bound in other projects.

/** Repository identity key: `jira:<normalizedBase>/<projectKey>` lowercased. */
export function jiraRepositoryKey(
  normalizedBase: string,
  projectKey: string,
): string {
  return `jira:${normalizedBase}/${projectKey.toLowerCase()}`;
}

async function createJiraIntegration({
  projectId,
  baseUrl,
  authMode,
  email,
  apiToken,
  projectKey,
  issueType,
  statusMap,
}: {
  projectId: string;
  baseUrl: string;
  authMode: "cloud" | "dc";
  email: string | undefined;
  apiToken: string | undefined;
  projectKey: string;
  issueType: string | undefined;
  statusMap: Record<string, string> | undefined;
}) {
  const project = await db.query.projectTable.findFirst({
    where: eq(projectTable.id, projectId),
  });

  if (!project) {
    throw new HTTPException(404, { message: "Project not found" });
  }

  if (authMode === "cloud" && !email?.trim()) {
    throw new HTTPException(400, {
      message: "Cloud authentication requires the Atlassian account email",
    });
  }

  const resolvedToken = await resolveVerificationToken({
    projectId,
    baseUrl,
    authMode,
    email,
    apiToken,
  });

  // The resolved token can come from another Jira binding of the project; a
  // cloud token is bound to the account email, so keep them together.
  const credentials = {
    baseUrl,
    authMode,
    email,
    apiToken: resolvedToken,
  };

  let jiraProject: { key: string; name: string };
  let selfAccountId: string | undefined;
  let selfDisplayName: string | undefined;
  try {
    const user = await verifyJiraToken(credentials);
    selfAccountId = user.accountId ?? user.name ?? user.key;
    selfDisplayName = user.displayName;

    const client = createJiraClient(credentials);
    jiraProject = await client.getProject(projectKey);
  } catch (error) {
    if (error instanceof JiraApiError) {
      throw new HTTPException((error.status || 400) as ContentfulStatusCode, {
        message: error.message,
      });
    }
    throw error;
  }

  // Enforce the per-project repository binding quota after project
  // verification and before the insert. 402 propagates unchanged.
  await assertRepositoryBindingQuota(projectId, project.workspaceId);

  // One secret per binding, never copied from an existing row: each row's
  // webhook route verifies with its own secret.
  const webhookSecret = randomBytes(24).toString("hex");

  const config: JiraConfig = {
    ...getDefaultJiraConfig({
      baseUrl,
      authMode,
      email,
      apiToken: resolvedToken,
      projectKey,
      issueType,
      webhookSecret,
      selfAccountId,
      selfDisplayName,
    }),
    ...(statusMap ? { statusMap } : {}),
  };

  const validation = await validateJiraConfig(config);
  if (!validation.valid) {
    throw new HTTPException(400, {
      message: validation.errors?.join(", ") ?? "Invalid config",
    });
  }

  try {
    const [newIntegration] = await db
      .insert(integrationTable)
      .values({
        projectId,
        type: "jira",
        config: JSON.stringify(config),
        repositoryKey: jiraRepositoryKey(
          config.baseUrl,
          projectKey.toLowerCase(),
        ),
        repositoryOwner: jiraProject.name,
        repositoryName: jiraProject.key,
        isActive: true,
      })
      .returning();

    if (!newIntegration) {
      throw new HTTPException(500, {
        message: "Failed to create Jira integration",
      });
    }

    return {
      id: newIntegration.id,
      projectId: newIntegration.projectId,
      baseUrl: config.baseUrl,
      repositoryOwner: jiraProject.name,
      repositoryName: jiraProject.key,
      webhookSecret,
      isActive: newIntegration.isActive,
      createdAt: newIntegration.createdAt,
      updatedAt: newIntegration.updatedAt,
    };
  } catch (error) {
    mapIntegrationUniqueViolation(error, { projectId, type: "jira" });
  }
}

export default createJiraIntegration;
