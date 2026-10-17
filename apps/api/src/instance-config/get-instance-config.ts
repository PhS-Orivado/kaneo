import { sql } from "drizzle-orm";
import db from "../database";
import { applyInstanceConfigEnv } from "./apply-instance-config-env";
import {
  S3_FIELDS,
  SMTP_FIELDS,
  type InstanceConfigField,
  type InstanceConfigRow,
} from "./instance-config-fields";
import { parseBoolean, parsePositiveInt } from "../storage/s3";

/** Public response shape: secrets are replaced by a "*Set" flag. */
export type InstanceConfig = {
  smtp: {
    host: string | null;
    port: number | null;
    secure: boolean;
    requireTls: boolean;
    user: string | null;
    password: null;
    passwordSet: boolean;
    from: string | null;
  };
  s3: {
    endpoint: string | null;
    region: string | null;
    bucket: string | null;
    accessKeyId: string | null;
    secretAccessKey: null;
    secretAccessKeySet: boolean;
    publicBaseUrl: string | null;
    keyPrefix: string | null;
    forcePathStyle: boolean;
  };
};

function text(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** The stored override when present, otherwise the environment value. */
function storedOrEnv(
  field: InstanceConfigField,
  row: InstanceConfigRow | null,
): string | number | boolean | null {
  const stored = row ? row[field.column] : null;
  if (stored !== null && stored !== undefined) {
    return stored;
  }

  const env = process.env[field.env];
  return env === undefined || env === "" ? null : env;
}

function effectiveText(value: string | number | boolean | null) {
  return typeof value === "string" ? text(value) : null;
}

function effectiveInt(value: string | number | boolean | null) {
  if (typeof value === "number") {
    return value > 0 ? value : null;
  }

  return parsePositiveInt(typeof value === "string" ? value : undefined, 0) ||
    null;
}

/**
 * Boolean defaults mirror the runtime readers (smtp-config and storage/s3), so
 * the UI shows what the instance really does when nothing is configured.
 */
function effectiveBoolean(value: string | number | boolean | null) {
  if (typeof value === "boolean") {
    return value;
  }

  return parseBoolean(typeof value === "string" ? value : undefined, true);
}

function toSection(
  fields: InstanceConfigField[],
  row: InstanceConfigRow | null,
) {
  const section: Record<string, unknown> = {};

  for (const field of fields) {
    const value = storedOrEnv(field, row);

    if (field.secret) {
      section[field.key] = null;
      section[`${field.key}Set`] = effectiveText(value) !== null;
      continue;
    }

    if (field.type === "int") {
      section[field.key] = effectiveInt(value);
    } else if (field.type === "boolean") {
      section[field.key] = effectiveBoolean(value);
    } else {
      section[field.key] = effectiveText(value);
    }
  }

  return section;
}

export function toInstanceConfig(row: InstanceConfigRow | null): InstanceConfig {
  return {
    smtp: toSection(SMTP_FIELDS, row) as InstanceConfig["smtp"],
    s3: toSection(S3_FIELDS, row) as InstanceConfig["s3"],
  };
}

// Reads the single 'default' row; the table is created by the startup
// migration, so a missing table falls back to environment-only config.
export async function readInstanceConfigRow(): Promise<InstanceConfigRow | null> {
  try {
    const result = (await db.execute(sql`
      SELECT smtp_host, smtp_port, smtp_secure, smtp_require_tls, smtp_user,
             smtp_password, smtp_from, s3_endpoint, s3_region, s3_bucket,
             s3_access_key_id, s3_secret_access_key, s3_public_base_url,
             s3_key_prefix, s3_force_path_style
      FROM instance_config
      WHERE id = 'default'
      LIMIT 1
    `)) as unknown as { rows: InstanceConfigRow[] };

    return result.rows?.[0] ?? null;
  } catch {
    return null;
  }
}

export async function getInstanceConfig(): Promise<InstanceConfig> {
  return toInstanceConfig(await readInstanceConfigRow());
}

/** Applies the stored config to the environment at startup. */
export async function applyStoredInstanceConfig() {
  const row = await readInstanceConfigRow();
  applyInstanceConfigEnv(row);
}

export default getInstanceConfig;
