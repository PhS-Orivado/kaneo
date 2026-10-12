import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import db from "../../database";
import { integrationTable, projectTable } from "../../database/schema";
import { mapIntegrationUniqueViolation } from "../../integrations/map-unique-violation";
import { assertRepositoryBindingQuota } from "../../plan-limits/repository-binding-quota";
import {
  type GiteaConfig,
  getDefaultGiteaConfig,
  normalizeGiteaBaseUrl,
  validateGiteaConfig,
} from "../../plugins/gitea/config";
import {
  createGiteaClient,
  GiteaApiError,
  verifyGiteaToken,
} from "../../plugins/gitea/utils/gitea-api";

import { resolveVerificationToken } from "./resolve-verification-token";

// RFC 0001 WP3: one integration row per Gitea repository. The old
// update-in-place branch (which reused the stored webhook secret) and the
// O(n) cross-project JSON scan are both deleted. Per governing decision D1
// cross-project duplicates are valid rows; per WP0 same-project duplicates
// are rejected by integration_project_type_repo_unique, which also closes
// the concurrency race the in-memory scan left open.

/** Repository identity key: `gitea:<normalizedBase>/<owner>/<name>` lowercased. */
export function giteaRepositoryKey(
  normalizedBase: string,
  repositoryOwner: string,
  repositoryName: string,
): string {
  return `gitea:${normalizedBase}/${repositoryOwner.toLowerCase()}/${repositoryName.toLowerCase()}`;
}

async function createGiteaIntegration({
  projectId,
  baseUrl,
  accessToken,
  repositoryOwner,
  repositoryName,
}: {
  projectId: string;
  baseUrl: string;
  accessToken: string | undefined;
  repositoryOwner: string;
  repositoryName: string;
}) {
  const project = await db.query.projectTable.findFirst({
    where: eq(projectTable.id, projectId),
  });

  if (!project) {
    throw new HTTPException(404, { message: "Project not found" });
  }

  const normalizedBase = normalizeGiteaBaseUrl(baseUrl);

  const resolvedToken = await resolveVerificationToken({
    projectId,
    baseUrl: normalizedBase,
    accessToken,
  });

  try {
    await verifyGiteaToken(normalizedBase, resolvedToken);

    const client = createGiteaClient({
      baseUrl: normalizedBase,
      accessToken: resolvedToken,
    });
    await client.getRepo(repositoryOwner, repositoryName);
  } catch (error) {
    if (error instanceof GiteaApiError) {
      throw new HTTPException((error.status || 400) as ContentfulStatusCode, {
        message: error.message,
      });
    }
    throw error;
  }

  // WP10: enforce the per-project repository binding quota after repository
  // verification and before the insert. 402 propagates unchanged.
  await assertRepositoryBindingQuota(projectId, project.workspaceId);

  // One secret per binding, never copied from an existing row: each row's
  // webhook route verifies with its own secret.
  const webhookSecret = randomBytes(24).toString("hex");

  const config: GiteaConfig = getDefaultGiteaConfig(
    normalizedBase,
    resolvedToken,
    repositoryOwner,
    repositoryName,
    webhookSecret,
  );

  const validation = await validateGiteaConfig(config);
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
        type: "gitea",
        config: JSON.stringify(config),
        repositoryKey: giteaRepositoryKey(
          normalizedBase,
          repositoryOwner,
          repositoryName,
        ),
        repositoryOwner,
        repositoryName,
        isActive: true,
      })
      .returning();

    if (!newIntegration) {
      throw new HTTPException(500, {
        message: "Failed to create Gitea integration",
      });
    }

    return {
      id: newIntegration.id,
      projectId: newIntegration.projectId,
      baseUrl: normalizedBase,
      repositoryOwner,
      repositoryName,
      webhookSecret,
      isActive: newIntegration.isActive,
      createdAt: newIntegration.createdAt,
      updatedAt: newIntegration.updatedAt,
    };
  } catch (error) {
    mapIntegrationUniqueViolation(error, { projectId, type: "gitea" });
  }
}

export default createGiteaIntegration;
