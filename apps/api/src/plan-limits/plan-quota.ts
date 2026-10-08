import { publishEvent } from "../events";
import type { LimitDimension } from "../billing/plans";
import { LimitExceededError } from "./limit-error";
import { resolveLimit } from "./resolve-limits";
import {
  countActiveWorkspaceIntegrations,
  countActiveWorkspaceRepositoryBindings,
  countWorkspaceMembers,
  countWorkspaceProjects,
  getWorkspaceStorageBytes,
} from "./usage";

// Plan-capacity guards for the dimensions introduced with the plan catalog.
// Each guard resolves the effective limit (workspace override → instance
// default → unlimited), counts current usage, publishes a conversion event
// exactly once per refused operation, and throws the shared 402 error shape.
//
// Race note: two concurrent creates can both pass the count check; this is an
// accepted transient overshoot for a billing guard, identical to the WP10
// repository binding quota. Storage additionally reconciles after upload.

function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }
  return `${Math.max(1, Math.round(bytes / (1024 * 1024)))} MB`;
}

async function assertDimension(
  dimension: LimitDimension,
  workspaceId: string,
  used: number,
): Promise<void> {
  const limit = await resolveLimit(workspaceId, dimension);
  if (limit === null || used < limit) {
    return;
  }

  await publishEvent("limit_exceeded", {
    dimension,
    workspaceId,
    used,
    limit,
  });
  throw new LimitExceededError({ dimension, used, limit, message: messageFor(dimension, used, limit) });
}

function messageFor(dimension: LimitDimension, used: number, limit: number) {
  switch (dimension) {
    case "users":
      return `Member limit reached: this workspace already uses ${used} of ${limit} seats included in the current plan. Upgrade to add more members.`;
    case "projects":
      return `Project limit reached: this workspace already uses ${used} of ${limit} projects included in the current plan. Upgrade to create more projects.`;
    case "repositories":
      return `Repository limit reached: this workspace already uses ${used} of ${limit} repository bindings included in the current plan. Upgrade to connect more repositories.`;
    case "integrations":
      return `Integration limit reached: this workspace already uses ${used} of ${limit} integrations included in the current plan. Upgrade to connect more integrations.`;
    default:
      return `Plan limit reached (${dimension}): ${used} of ${limit} used. Upgrade to continue.`;
  }
}

/** Enforce maxUsers before an invitation is created or a member is added. */
export async function assertUserLimit(workspaceId: string): Promise<void> {
  await assertDimension("users", workspaceId, await countWorkspaceMembers(workspaceId));
}

/** Enforce maxProjects before a project is created. */
export async function assertProjectLimit(workspaceId: string): Promise<void> {
  await assertDimension("projects", workspaceId, await countWorkspaceProjects(workspaceId));
}

/** Enforce maxRepositories (workspace total) before a repository binding is created or reactivated. */
export async function assertWorkspaceRepositoryLimit(
  workspaceId: string,
): Promise<void> {
  await assertDimension(
    "repositories",
    workspaceId,
    await countActiveWorkspaceRepositoryBindings(workspaceId),
  );
}

/** Enforce maxIntegrations before an integration is created or reactivated. */
export async function assertIntegrationLimit(
  workspaceId: string,
): Promise<void> {
  await assertDimension(
    "integrations",
    workspaceId,
    await countActiveWorkspaceIntegrations(workspaceId),
  );
}

/**
 * Enforce storageBytes before a presigned upload is issued: current stored
 * bytes plus the incoming object size must fit into the plan quota.
 */
export async function assertStorageQuota(
  workspaceId: string,
  additionalBytes: number,
): Promise<void> {
  const limit = await resolveLimit(workspaceId, "storage");
  if (limit === null || additionalBytes <= 0) {
    return;
  }

  const used = await getWorkspaceStorageBytes(workspaceId);
  if (used + additionalBytes <= limit) {
    return;
  }

  await publishEvent("limit_exceeded", {
    dimension: "storage",
    workspaceId,
    used,
    limit,
  });
  throw new LimitExceededError({
    dimension: "storage",
    used,
    limit,
    message: `Storage limit reached: this workspace uses ${formatBytes(used)} of ${formatBytes(limit)} included in the current plan. Upgrade to upload more.`,
  });
}
