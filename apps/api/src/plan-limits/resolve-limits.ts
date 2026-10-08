import { eq } from "drizzle-orm";
import db from "../database";
import { workspaceLimitTable } from "../database/schema";
import type { LimitDimension } from "../billing/plans";
import type { IntegrationDatabase } from "../plugins/github/services/integration-task-scope";

// Resolution order, first match wins (mirrors the original WP10 design for
// repository bindings and generalizes it to every plan dimension):
//   1. workspace_limit column for the dimension (written by billing)
//   2. instance default from the environment (unset or non-positive means
//      unlimited)
//   3. unlimited (null)
// The billing integration point stays the workspace_limit row: when a
// subscription changes plan, billing writes the new values and the very next
// request enforces them. No API process coupling is required.

const INSTANCE_DEFAULT_ENV: Record<LimitDimension, string> = {
  users: "KANEO_MAX_USERS_PER_WORKSPACE",
  projects: "KANEO_MAX_PROJECTS_PER_WORKSPACE",
  repositoriesPerProject: "KANEO_MAX_REPOSITORIES_PER_PROJECT",
  repositories: "KANEO_MAX_REPOSITORIES_PER_WORKSPACE",
  storage: "KANEO_MAX_STORAGE_BYTES",
  integrations: "KANEO_MAX_INTEGRATIONS_PER_WORKSPACE",
};

const WORKSPACE_LIMIT_COLUMN: Record<
  LimitDimension,
  keyof typeof workspaceLimitTable.$inferSelect
> = {
  users: "maxUsers",
  projects: "maxProjects",
  repositoriesPerProject: "maxRepositoriesPerProject",
  repositories: "maxRepositories",
  storage: "storageBytes",
  integrations: "maxIntegrations",
};

export interface ResolvedLimits {
  maxUsers: number | null;
  maxProjects: number | null;
  maxRepositoriesPerProject: number | null;
  maxRepositories: number | null;
  storageBytes: number | null;
  maxIntegrations: number | null;
}

function parsePositiveInt(raw: string | undefined): number | null {
  if (!raw || !raw.trim()) return null;
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : null;
}

export function instanceDefaultLimit(dimension: LimitDimension): number | null {
  return parsePositiveInt(process.env[INSTANCE_DEFAULT_ENV[dimension]]);
}

export function instanceDefaultMaxRepositoriesPerProject(): number | null {
  return instanceDefaultLimit("repositoriesPerProject");
}

/** Resolve a single dimension's effective limit. null = unlimited. */
export async function resolveLimit(
  workspaceId: string,
  dimension: LimitDimension,
  database: IntegrationDatabase = db,
): Promise<number | null> {
  const column = WORKSPACE_LIMIT_COLUMN[dimension];
  const [row] = await database
    .select({ value: workspaceLimitTable[column] })
    .from(workspaceLimitTable)
    .where(eq(workspaceLimitTable.workspaceId, workspaceId))
    .limit(1);
  const override = row?.value;
  if (typeof override === "number" && override >= 0) {
    return override;
  }
  return instanceDefaultLimit(dimension);
}

/** Resolve every dimension in one row read (for usage reporting). */
export async function resolveWorkspaceLimits(
  workspaceId: string,
  database: IntegrationDatabase = db,
): Promise<ResolvedLimits> {
  const [row] = await database
    .select()
    .from(workspaceLimitTable)
    .where(eq(workspaceLimitTable.workspaceId, workspaceId))
    .limit(1);

  const pick = (value: number | null | undefined): number | null =>
    typeof value === "number" && value >= 0 ? value : null;

  return {
    maxUsers:
      pick(row?.maxUsers) ?? instanceDefaultLimit("users"),
    maxProjects:
      pick(row?.maxProjects) ?? instanceDefaultLimit("projects"),
    maxRepositoriesPerProject:
      pick(row?.maxRepositoriesPerProject) ??
      instanceDefaultLimit("repositoriesPerProject"),
    maxRepositories:
      pick(row?.maxRepositories) ?? instanceDefaultLimit("repositories"),
    storageBytes:
      pick(row?.storageBytes) ?? instanceDefaultLimit("storage"),
    maxIntegrations:
      pick(row?.maxIntegrations) ?? instanceDefaultLimit("integrations"),
  };
}

export interface RepositoryBindingLimits {
  /** null = unlimited */
  maxPerProject: number | null;
}

/** Kept for the existing WP10 call sites; resolves the per-project quota. */
export async function resolveRepositoryBindingLimits(
  workspaceId: string,
  database: IntegrationDatabase = db,
): Promise<RepositoryBindingLimits> {
  return {
    maxPerProject: await resolveLimit(
      workspaceId,
      "repositoriesPerProject",
      database,
    ),
  };
}
