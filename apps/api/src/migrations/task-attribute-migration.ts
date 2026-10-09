import { eq, inArray, sql } from "drizzle-orm";
import db from "../database";
import {
  dataMigrationTable,
  taskAttributeTable,
  workspaceRoleTable,
  workspaceTable,
} from "../database/schema";
import { SEED_TASK_ATTRIBUTES } from "../task-attribute/attribute-validation";

const MIGRATION_ID = "task-attributes-v1";

// RFC 0002: statement sets backfilled into existing workspace_role rows that
// predate the taskAttribute resource. Custom roles (anything outside the
// seeded defaults) get read-only access so boards stay usable without
// retroactively granting administrative powers.
const ROLE_TASK_ATTRIBUTE_STATEMENTS: Record<string, string[]> = {
  viewer: ["read"],
  member: ["read"],
  admin: ["create", "read", "update", "delete"],
};
const FALLBACK_TASK_ATTRIBUTE_STATEMENTS = ["read"];

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * One-shot runtime migration for RFC 0002 (task attributes):
 *
 * 1. Seeds the default attributes (Task/Bug/Doc) for every workspace that
 *    has none. Workspaces that already define attributes keep them as-is.
 * 2. Backfills the taskAttribute statements into every workspace_role row
 *    whose stored permission JSON lacks the key, without disturbing any
 *    other customization made in the Roles UI.
 *
 * Idempotent: the data_migration marker row guards re-runs, and the advisory
 * lock keeps concurrent API replicas from racing each other. Runs after the
 * Drizzle migration that creates the task_attribute table.
 */
export async function migrateTaskAttributes() {
  await db.transaction(async (coordinator) => {
    await coordinator.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext('task-attributes-migration-v1'))`,
    );

    const [marker] = await coordinator
      .select({ id: dataMigrationTable.id })
      .from(dataMigrationTable)
      .where(eq(dataMigrationTable.id, MIGRATION_ID))
      .limit(1);
    if (marker) return;

    await seedMissingWorkspaceAttributes(coordinator);
    await backfillRoleStatements(coordinator);

    await coordinator
      .insert(dataMigrationTable)
      .values({ id: MIGRATION_ID });
  });
}

async function seedMissingWorkspaceAttributes(tx: Tx) {
  const workspaces = await tx
    .select({ id: workspaceTable.id })
    .from(workspaceTable);
  if (workspaces.length === 0) return;

  const workspaceIds = workspaces.map((workspace) => workspace.id);
  const withAttributes = await tx
    .selectDistinct({ workspaceId: taskAttributeTable.workspaceId })
    .from(taskAttributeTable)
    .where(inArray(taskAttributeTable.workspaceId, workspaceIds));
  const seeded = new Set(withAttributes.map((row) => row.workspaceId));

  const rows: Array<typeof taskAttributeTable.$inferInsert> = [];
  for (const workspaceId of workspaceIds) {
    if (seeded.has(workspaceId)) continue;
    for (const attribute of SEED_TASK_ATTRIBUTES) {
      rows.push({ ...attribute, workspaceId });
    }
  }

  if (rows.length === 0) return;

  // Postgres caps bind parameters per statement (65535); insert in chunks.
  const BATCH_SIZE = 1000;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    await tx.insert(taskAttributeTable).values(rows.slice(i, i + BATCH_SIZE));
  }
  console.log(
    "Seeded task attributes for " +
      (rows.length / SEED_TASK_ATTRIBUTES.length) +
      " workspace(s).",
  );
}

async function backfillRoleStatements(tx: Tx) {
  const roles = await tx
    .select({
      id: workspaceRoleTable.id,
      role: workspaceRoleTable.role,
      permission: workspaceRoleTable.permission,
    })
    .from(workspaceRoleTable);

  const now = new Date();
  for (const row of roles) {
    let permission: unknown;
    try {
      permission = JSON.parse(row.permission);
    } catch {
      // Leave malformed rows untouched; the permission middleware already
      // falls back to the compiled-in statements for unparseable payloads.
      continue;
    }
    if (
      !permission ||
      typeof permission !== "object" ||
      Array.isArray(permission) ||
      Object.hasOwn(permission as object, "taskAttribute")
    ) {
      continue;
    }

    const updated = permission as Record<string, unknown>;
    updated.taskAttribute =
      ROLE_TASK_ATTRIBUTE_STATEMENTS[row.role] ??
      FALLBACK_TASK_ATTRIBUTE_STATEMENTS;

    await tx
      .update(workspaceRoleTable)
      .set({ permission: JSON.stringify(updated), updatedAt: now })
      .where(eq(workspaceRoleTable.id, row.id));
  }
}
