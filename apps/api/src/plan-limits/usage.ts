import { and, count, eq, inArray, sql } from "drizzle-orm";
import db from "../database";
import { assetTable, integrationTable, projectTable, workspaceUserTable } from "../database/schema";
import type { LimitDimension } from "../billing/plans";
import { REPOSITORY_BINDING_TYPES } from "./repository-binding-quota";
import { resolveWorkspaceLimits } from "./resolve-limits";

/**
 * Current usage per limit dimension, for the billing usage meters. Counts are
 * single indexed aggregates; storage usage is the sum of the recorded asset
 * sizes (never a storage-backend scan).
 */
export interface DimensionUsage {
  /** null when the dimension has no meaningful workspace-level total. */
  used: number | null;
  /** null = unlimited */
  limit: number | null;
}

export type WorkspaceUsage = Record<LimitDimension, DimensionUsage>;

export async function countWorkspaceMembers(workspaceId: string) {
  const [row] = await db
    .select({ value: count() })
    .from(workspaceUserTable)
    .where(eq(workspaceUserTable.workspaceId, workspaceId));
  return row?.value ?? 0;
}

export async function countWorkspaceProjects(workspaceId: string) {
  const [row] = await db
    .select({ value: count() })
    .from(projectTable)
    .where(eq(projectTable.workspaceId, workspaceId));
  return row?.value ?? 0;
}

export async function countActiveWorkspaceIntegrations(workspaceId: string) {
  const [row] = await db
    .select({ value: count() })
    .from(integrationTable)
    .innerJoin(projectTable, eq(projectTable.id, integrationTable.projectId))
    .where(
      and(
        eq(projectTable.workspaceId, workspaceId),
        eq(integrationTable.isActive, true),
      ),
    );
  return row?.value ?? 0;
}

export async function countActiveWorkspaceRepositoryBindings(
  workspaceId: string,
) {
  const [row] = await db
    .select({ value: count() })
    .from(integrationTable)
    .innerJoin(projectTable, eq(projectTable.id, integrationTable.projectId))
    .where(
      and(
        eq(projectTable.workspaceId, workspaceId),
        inArray(integrationTable.type, [...REPOSITORY_BINDING_TYPES]),
        eq(integrationTable.isActive, true),
      ),
    );
  return row?.value ?? 0;
}

export async function getWorkspaceStorageBytes(workspaceId: string) {
  const [row] = await db
    .select({ value: sql<number>`coalesce(sum(${assetTable.size}), 0)::bigint` })
    .from(assetTable)
    .where(eq(assetTable.workspaceId, workspaceId));
  return Number(row?.value ?? 0);
}

export async function getWorkspaceUsage(
  workspaceId: string,
): Promise<WorkspaceUsage> {
  const limits = await resolveWorkspaceLimits(workspaceId);
  const [users, projects, repositories, integrations, storageBytes] =
    await Promise.all([
      countWorkspaceMembers(workspaceId),
      countWorkspaceProjects(workspaceId),
      countActiveWorkspaceRepositoryBindings(workspaceId),
      countActiveWorkspaceIntegrations(workspaceId),
      getWorkspaceStorageBytes(workspaceId),
    ]);

  return {
    users: { used: users, limit: limits.maxUsers },
    projects: { used: projects, limit: limits.maxProjects },
    // The per-project quota is enforced per project; there is no single
    // workspace-level usage number for it, so only the limit is reported.
    repositoriesPerProject: { used: null, limit: limits.maxRepositoriesPerProject },
    repositories: { used: repositories, limit: limits.maxRepositories },
    storage: { used: storageBytes, limit: limits.storageBytes },
    integrations: { used: integrations, limit: limits.maxIntegrations },
  };
}
