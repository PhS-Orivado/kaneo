import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import db from "../../database";
import { integrationTable, projectTable } from "../../database/schema";
import { mapIntegrationUniqueViolation } from "../../integrations/map-unique-violation";
import { assertRepositoryBindingQuota } from "../../plan-limits/repository-binding-quota";
import {
  assertIntegrationLimit,
  assertWorkspaceRepositoryLimit,
} from "../../plan-limits/plan-quota";
import {
  type GitlabConfig,
  type GitlabTokenType,
  getDefaultGitlabConfig,
  normalizeGitlabBaseUrl,
  validateGitlabConfig,
} from "../../plugins/gitlab/config";
import {
  createGitlabClient,
  GitlabApiError,
  verifyGitlabToken,
} from "../../plugins/gitlab/utils/gitlab-api";
import {
  parseGitlabBaseUrl,
  parseGitlabProjectPath,
} from "../utils/normalize-input";

// RFC 0001 WP4: one integration row per GitLab project. The old
// update-in-place branch (which reused the stored webhook secret and carried
// settings over) and the O(n) cross-project JSON scan are both deleted. Per
// governing decision D1 cross-project duplicates are valid rows; per WP0
// same-project duplicates are rejected by integration_project_type_repo_unique.
// GitLab addresses repositories by namespaced project path, so the identity
// key is the normalized base URL plus the lowercased full path; the derived
// owner/name columns are display convenience only.

/** Repository identity key: `gitlab:<normalizedBase>/<projectPath>` lowercased. */
export function gitlabRepositoryKey(
  normalizedBase: string,
  projectPath: string,
): string {
  return `gitlab:${normalizedBase}/${projectPath.toLowerCase()}`;
}

function repositoryIdentity(projectPath: string): {
  repositoryOwner: string;
  repositoryName: string;
} {
  const segments = projectPath.split("/");
  return {
    // Top-level group, display convenience only.
    repositoryOwner: segments[0] ?? "",
    // Final path segment, display convenience only.
    repositoryName: segments[segments.length - 1] ?? "",
  };
}

async function createGitlabIntegration({
  projectId,
  baseUrl,
  accessToken,
  tokenType,
  projectPath,
}: {
  projectId: string;
  baseUrl: string;
  accessToken: string | undefined;
  tokenType: GitlabTokenType;
  projectPath: string;
}) {
  const project = await db.query.projectTable.findFirst({
    where: eq(projectTable.id, projectId),
  });

  if (!project) {
    throw new HTTPException(404, { message: "Project not found" });
  }

  const normalizedBase = parseGitlabBaseUrl(baseUrl);
  const normalizedPath = parseGitlabProjectPath(projectPath);

  // A saved credential is only authorized for its original server. The first
  // binding row holds the stored token for the unchanged base URL.
  const existingIntegration = await db.query.integrationTable.findFirst({
    where: and(
      eq(integrationTable.projectId, projectId),
      eq(integrationTable.type, "gitlab"),
    ),
  });

  let previousConfig: Partial<GitlabConfig> = {};
  if (existingIntegration) {
    try {
      previousConfig = JSON.parse(existingIntegration.config) as GitlabConfig;
    } catch (error) {
      console.warn("Failed to parse existing GitLab integration config", {
        integrationId: existingIntegration.id,
        error,
      });
    }
  }

  const suppliedToken = accessToken?.trim();
  if (!suppliedToken && previousConfig.accessToken) {
    let savedBase: string | undefined;
    try {
      savedBase = normalizeGitlabBaseUrl(previousConfig.baseUrl ?? "");
    } catch {
      // Invalid legacy destinations cannot authorize credential reuse.
    }
    if (savedBase !== normalizedBase) {
      throw new HTTPException(400, {
        message: "Enter a new access token when changing the GitLab URL",
      });
    }
  }
  const resolvedToken = suppliedToken || previousConfig.accessToken || "";

  if (!resolvedToken) {
    throw new HTTPException(400, {
      message: "Access token is required",
    });
  }

  try {
    await verifyGitlabToken(normalizedBase, resolvedToken, tokenType);

    const client = createGitlabClient({
      baseUrl: normalizedBase,
      accessToken: resolvedToken,
      tokenType,
    });
    await client.getProject(normalizedPath);
  } catch (error) {
    if (error instanceof GitlabApiError) {
      throw new HTTPException((error.status || 400) as ContentfulStatusCode, {
        message: error.message,
      });
    }
    throw error;
  }

  // WP10: enforce the per-project repository binding quota after project
  // verification and before the insert. 402 propagates unchanged.
  await assertRepositoryBindingQuota(projectId, project.workspaceId);
  // Plan limits: workspace-wide repository total and integration count.
  await assertWorkspaceRepositoryLimit(project.workspaceId);
  await assertIntegrationLimit(project.workspaceId);

  // One secret per binding, never copied from an existing row: each row's
  // webhook route verifies with its own secret, so two bindings of the same
  // GitLab project never interfere.
  const webhookSecret = randomBytes(24).toString("hex");

  const config: GitlabConfig = getDefaultGitlabConfig(
    normalizedBase,
    resolvedToken,
    tokenType,
    normalizedPath,
    webhookSecret,
  );

  const validation = await validateGitlabConfig(config);
  if (!validation.valid) {
    throw new HTTPException(400, {
      message: validation.errors?.join(", ") ?? "Invalid config",
    });
  }

  const identity = repositoryIdentity(normalizedPath);

  try {
    const [newIntegration] = await db
      .insert(integrationTable)
      .values({
        projectId,
        type: "gitlab",
        config: JSON.stringify(config),
        repositoryKey: gitlabRepositoryKey(normalizedBase, normalizedPath),
        repositoryOwner: identity.repositoryOwner,
        repositoryName: identity.repositoryName,
        baseUrl: normalizedBase,
        isActive: true,
      })
      .returning();

    if (!newIntegration) {
      throw new HTTPException(500, {
        message: "Failed to create GitLab integration",
      });
    }

    return {
      id: newIntegration.id,
      projectId: newIntegration.projectId,
      baseUrl: normalizedBase,
      projectPath: normalizedPath,
      tokenType,
      webhookSecret,
      isActive: newIntegration.isActive,
      createdAt: newIntegration.createdAt,
      updatedAt: newIntegration.updatedAt,
    };
  } catch (error) {
    mapIntegrationUniqueViolation(error, { projectId, type: "gitlab" });
  }
}

export default createGitlabIntegration;
