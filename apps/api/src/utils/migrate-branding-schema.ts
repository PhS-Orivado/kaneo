import { sql } from "drizzle-orm";
import db from "../database";

/**
 * Creates the single-row instance branding table used by the white-labeling
 * settings, following the same idempotent pattern as the notification
 * preference schema migration.
 */
export async function migrateBrandingSchema() {
  console.log("🔄 Checking instance branding schema...");

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "instance_branding" (
        "id" text PRIMARY KEY NOT NULL,
        "app_name" text,
        "logo_light_url" text,
        "logo_dark_url" text,
        "accent_color" text,
        "footer_text" text,
        "footer_url" text,
        "terms_url" text,
        "privacy_url" text,
        "show_powered_by" boolean DEFAULT true NOT NULL,
        "created_at" timestamp DEFAULT (now() AT TIME ZONE 'utc') NOT NULL,
        "updated_at" timestamp DEFAULT (now() AT TIME ZONE 'utc') NOT NULL
      );
    `);

    await db.execute(sql`
      ALTER TABLE "instance_branding"
      ADD COLUMN IF NOT EXISTS "app_name" text,
      ADD COLUMN IF NOT EXISTS "logo_light_url" text,
      ADD COLUMN IF NOT EXISTS "logo_dark_url" text,
      ADD COLUMN IF NOT EXISTS "accent_color" text,
      ADD COLUMN IF NOT EXISTS "footer_text" text,
      ADD COLUMN IF NOT EXISTS "footer_url" text,
      ADD COLUMN IF NOT EXISTS "terms_url" text,
      ADD COLUMN IF NOT EXISTS "privacy_url" text,
      ADD COLUMN IF NOT EXISTS "show_powered_by" boolean DEFAULT true NOT NULL,
      ADD COLUMN IF NOT EXISTS "created_at" timestamp DEFAULT (now() AT TIME ZONE 'utc') NOT NULL,
      ADD COLUMN IF NOT EXISTS "updated_at" timestamp DEFAULT (now() AT TIME ZONE 'utc') NOT NULL;
    `);

    console.log("✅ Instance branding schema check complete!");
  } catch (error) {
    console.error("❌ Error during instance branding migration:", error);
    throw error;
  }
}
