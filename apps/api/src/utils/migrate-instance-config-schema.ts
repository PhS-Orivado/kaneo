import { sql } from "drizzle-orm";
import db from "../database";

/**
 * Creates the single-row instance config table that lets instance
 * administrators configure SMTP email and S3 storage from the UI, following
 * the same idempotent pattern as the branding schema migration.
 */
export async function migrateInstanceConfigSchema() {
  console.log("🔄 Checking instance config schema...");

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "instance_config" (
        "id" text PRIMARY KEY NOT NULL,
        "smtp_host" text,
        "smtp_port" integer,
        "smtp_secure" boolean,
        "smtp_require_tls" boolean,
        "smtp_user" text,
        "smtp_password" text,
        "smtp_from" text,
        "s3_endpoint" text,
        "s3_region" text,
        "s3_bucket" text,
        "s3_access_key_id" text,
        "s3_secret_access_key" text,
        "s3_public_base_url" text,
        "s3_key_prefix" text,
        "s3_force_path_style" boolean,
        "created_at" timestamp DEFAULT (now() AT TIME ZONE 'utc') NOT NULL,
        "updated_at" timestamp DEFAULT (now() AT TIME ZONE 'utc') NOT NULL
      );
    `);

    await db.execute(sql`
      ALTER TABLE "instance_config"
      ADD COLUMN IF NOT EXISTS "smtp_host" text,
      ADD COLUMN IF NOT EXISTS "smtp_port" integer,
      ADD COLUMN IF NOT EXISTS "smtp_secure" boolean,
      ADD COLUMN IF NOT EXISTS "smtp_require_tls" boolean,
      ADD COLUMN IF NOT EXISTS "smtp_user" text,
      ADD COLUMN IF NOT EXISTS "smtp_password" text,
      ADD COLUMN IF NOT EXISTS "smtp_from" text,
      ADD COLUMN IF NOT EXISTS "s3_endpoint" text,
      ADD COLUMN IF NOT EXISTS "s3_region" text,
      ADD COLUMN IF NOT EXISTS "s3_bucket" text,
      ADD COLUMN IF NOT EXISTS "s3_access_key_id" text,
      ADD COLUMN IF NOT EXISTS "s3_secret_access_key" text,
      ADD COLUMN IF NOT EXISTS "s3_public_base_url" text,
      ADD COLUMN IF NOT EXISTS "s3_key_prefix" text,
      ADD COLUMN IF NOT EXISTS "s3_force_path_style" boolean,
      ADD COLUMN IF NOT EXISTS "created_at" timestamp DEFAULT (now() AT TIME ZONE 'utc') NOT NULL,
      ADD COLUMN IF NOT EXISTS "updated_at" timestamp DEFAULT (now() AT TIME ZONE 'utc') NOT NULL;
    `);

    console.log("✅ Instance config schema check complete!");
  } catch (error) {
    console.error("❌ Error during instance config migration:", error);
    throw error;
  }
}
