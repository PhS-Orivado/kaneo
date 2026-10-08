import { sql } from "drizzle-orm";
import db from "../database";
import { workspaceLimitTable } from "../database/schema";
import type { Plan } from "./config";

/**
 * Plan catalog: the single source of truth for what each plan allows. The
 * values are written into `workspace_limit` by billing when a subscription
 * activates or changes plan; the API only reads them. `null` means unlimited.
 *
 * Dimensions:
 * - maxUsers: workspace members, including the owner. For the seat-based team
 *   plan this is null: seats are purchased, so the member count is the limit.
 * - maxProjects: projects in the workspace.
 * - maxRepositoriesPerProject: active git-provider bindings per project.
 * - maxRepositories: active git-provider bindings across the workspace.
 * - storageBytes: aggregate size of stored objects (attachments, backgrounds).
 * - maxIntegrations: active integrations of every type in the workspace.
 */
export type LimitDimension =
  | "users"
  | "projects"
  | "repositoriesPerProject"
  | "repositories"
  | "storage"
  | "integrations";

export interface PlanLimits {
  maxUsers: number | null;
  maxProjects: number | null;
  maxRepositoriesPerProject: number | null;
  maxRepositories: number | null;
  storageBytes: number | null;
  maxIntegrations: number | null;
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  personal: {
    maxUsers: 1,
    maxProjects: 3,
    maxRepositoriesPerProject: 2,
    maxRepositories: 6,
    storageBytes: 1_000_000_000,
    maxIntegrations: 3,
  },
  team: {
    maxUsers: null,
    maxProjects: null,
    maxRepositoriesPerProject: 10,
    maxRepositories: null,
    storageBytes: 10_000_000_000,
    maxIntegrations: 25,
  },
};

/**
 * Trial workspaces are limited like the team plan until they subscribe. The
 * values mirror PLAN_LIMITS.team so the trial experience matches the paid one
 * without granting unlimited capacity for free.
 */
export const TRIAL_LIMITS: PlanLimits = PLAN_LIMITS.team;

export function planLimitsFor(plan: Plan): PlanLimits {
  return PLAN_LIMITS[plan];
}

type DbOrTx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Persist a plan's limits for a workspace. Called from the billing webhook
 * transaction so limits take effect with the subscription change, without any
 * API restart. Columns left undefined keep their previous value, which makes
 * downgrades explicit: every catalog dimension is always written.
 */
export async function writeWorkspaceLimits(
  workspaceId: string,
  limits: PlanLimits,
  database: DbOrTx = db,
): Promise<void> {
  await database
    .insert(workspaceLimitTable)
    .values({
      workspaceId,
      maxUsers: limits.maxUsers,
      maxProjects: limits.maxProjects,
      maxRepositoriesPerProject: limits.maxRepositoriesPerProject,
      maxRepositories: limits.maxRepositories,
      storageBytes: limits.storageBytes,
      maxIntegrations: limits.maxIntegrations,
    })
    .onConflictDoUpdate({
      target: workspaceLimitTable.workspaceId,
      set: {
        maxUsers: sql`excluded.max_users`,
        maxProjects: sql`excluded.max_projects`,
        maxRepositoriesPerProject: sql`excluded.max_repositories_per_project`,
        maxRepositories: sql`excluded.max_repositories`,
        storageBytes: sql`excluded.storage_bytes`,
        maxIntegrations: sql`excluded.max_integrations`,
      },
    });
}
