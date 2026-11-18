import { sql } from "drizzle-orm";
import db from "../database";
import type { z } from "zod";
import { applyInstanceConfigEnv } from "./apply-instance-config-env";
import {
  INSTANCE_CONFIG_FIELDS,
  SMTP_FIELDS,
  type InstanceConfigField,
  type InstanceConfigRow,
} from "./instance-config-fields";
import { readInstanceConfigRow, toInstanceConfig } from "./get-instance-config";
import type { updateInstanceConfigBody } from "../admin/schema";

type UpdateInstanceConfigInput = z.infer<typeof updateInstanceConfigBody>;
type Section = Record<string, string | number | boolean | null>;

const SMTP_ENV_KEYS = new Set(SMTP_FIELDS.map((field) => field.env));

function textOrNull(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function sectionFor(field: InstanceConfigField, input: UpdateInstanceConfigInput) {
  return (SMTP_ENV_KEYS.has(field.env) ? input.smtp : input.s3) as Section;
}

/** Stored row for the given input: null secrets keep the current value. */
function mergeRow(
  input: UpdateInstanceConfigInput,
  current: InstanceConfigRow | null,
): InstanceConfigRow {
  const row: Record<string, string | number | boolean | null> = {};

  for (const field of INSTANCE_CONFIG_FIELDS) {
    const value = sectionFor(field, input)[field.key];

    if (field.secret) {
      row[field.column] =
        textOrNull(value as string | null) ??
        (current ? current[field.column] : null);
      continue;
    }

    if (field.type === "text") {
      row[field.column] = textOrNull(value as string | null);
      continue;
    }

    row[field.column] = value;
  }

  return row as InstanceConfigRow;
}

export async function updateInstanceConfig(
  input: UpdateInstanceConfigInput,
) {
  const current = await readInstanceConfigRow();
  const row = mergeRow(input, current);

  await db.execute(sql`
    INSERT INTO instance_config (
      id, smtp_host, smtp_port, smtp_secure, smtp_require_tls, smtp_user,
      smtp_password, smtp_from, s3_endpoint, s3_region, s3_bucket,
      s3_access_key_id, s3_secret_access_key, s3_public_base_url,
      s3_key_prefix, s3_force_path_style, updated_at
    )
    VALUES (
      'default', ${row.smtp_host}, ${row.smtp_port}, ${row.smtp_secure},
      ${row.smtp_require_tls}, ${row.smtp_user}, ${row.smtp_password},
      ${row.smtp_from}, ${row.s3_endpoint}, ${row.s3_region}, ${row.s3_bucket},
      ${row.s3_access_key_id}, ${row.s3_secret_access_key},
      ${row.s3_public_base_url}, ${row.s3_key_prefix}, ${row.s3_force_path_style},
      (now() AT TIME ZONE 'utc')
    )
    ON CONFLICT (id) DO UPDATE SET
      smtp_host = EXCLUDED.smtp_host,
      smtp_port = EXCLUDED.smtp_port,
      smtp_secure = EXCLUDED.smtp_secure,
      smtp_require_tls = EXCLUDED.smtp_require_tls,
      smtp_user = EXCLUDED.smtp_user,
      smtp_password = EXCLUDED.smtp_password,
      smtp_from = EXCLUDED.smtp_from,
      s3_endpoint = EXCLUDED.s3_endpoint,
      s3_region = EXCLUDED.s3_region,
      s3_bucket = EXCLUDED.s3_bucket,
      s3_access_key_id = EXCLUDED.s3_access_key_id,
      s3_secret_access_key = EXCLUDED.s3_secret_access_key,
      s3_public_base_url = EXCLUDED.s3_public_base_url,
      s3_key_prefix = EXCLUDED.s3_key_prefix,
      s3_force_path_style = EXCLUDED.s3_force_path_style,
      updated_at = (now() AT TIME ZONE 'utc')
  `);

  applyInstanceConfigEnv(row);

  return toInstanceConfig(row);
}

export default updateInstanceConfig;
