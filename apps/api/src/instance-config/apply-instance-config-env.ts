import { config } from "dotenv-mono";
import { INSTANCE_CONFIG_FIELDS } from "./instance-config-fields";
import type { InstanceConfigRow } from "./instance-config-fields";

config();

// The environment as it was before any UI-saved override was applied, so a
// cleared value can fall back to the deployment's own configuration.
let bootEnv: Record<string, string | undefined> | undefined;

function snapshotBootEnv() {
  if (!bootEnv) {
    bootEnv = Object.fromEntries(
      INSTANCE_CONFIG_FIELDS.map((field) => [field.env, process.env[field.env]]),
    );
  }
}

/**
 * Applies the stored instance config to process.env. A null column restores the
 * boot-time environment value, so the UI can clear an override without losing
 * the deployment's own configuration.
 *
 * shortcut: config applies to this process only; instances running several API
 * processes should restart them (or re-save the settings) to sync all of them.
 */
export function applyInstanceConfigEnv(row: Partial<InstanceConfigRow> | null) {
  snapshotBootEnv();

  for (const field of INSTANCE_CONFIG_FIELDS) {
    const value = row ? row[field.column] : null;

    if (value === null || value === undefined) {
      if (bootEnv?.[field.env] === undefined) {
        delete process.env[field.env];
      } else {
        process.env[field.env] = bootEnv?.[field.env];
      }
      continue;
    }

    process.env[field.env] = String(value);
  }
}
