import { sql } from "drizzle-orm";
import db from "../database";

export type Branding = {
  appName: string | null;
  logoLightUrl: string | null;
  logoDarkUrl: string | null;
  accentColor: string | null;
  footerText: string | null;
  footerUrl: string | null;
  termsUrl: string | null;
  privacyUrl: string | null;
  showPoweredBy: boolean;
};

type BrandingRow = {
  app_name: string | null;
  logo_light_url: string | null;
  logo_dark_url: string | null;
  accent_color: string | null;
  footer_text: string | null;
  footer_url: string | null;
  terms_url: string | null;
  privacy_url: string | null;
  show_powered_by: boolean | null;
};

export const DEFAULT_BRANDING: Branding = {
  appName: null,
  logoLightUrl: null,
  logoDarkUrl: null,
  accentColor: null,
  footerText: null,
  footerUrl: null,
  termsUrl: null,
  privacyUrl: null,
  showPoweredBy: true,
};

function toBranding(row: BrandingRow | null): Branding {
  if (!row) {
    return DEFAULT_BRANDING;
  }

  return {
    appName: row.app_name,
    logoLightUrl: row.logo_light_url,
    logoDarkUrl: row.logo_dark_url,
    accentColor: row.accent_color,
    footerText: row.footer_text,
    footerUrl: row.footer_url,
    termsUrl: row.terms_url,
    privacyUrl: row.privacy_url,
    showPoweredBy: row.show_powered_by ?? true,
  };
}

// Reads the single 'default' row. The table is created by the startup
// migration (migrateBrandingSchema), so a missing table falls back to the
// defaults instead of failing the public config endpoint.
export async function getBranding(): Promise<Branding> {
  try {
    const result = (await db.execute(sql`
      SELECT app_name, logo_light_url, logo_dark_url, accent_color,
             footer_text, footer_url, terms_url, privacy_url, show_powered_by
      FROM instance_branding
      WHERE id = 'default'
      LIMIT 1
    `)) as unknown as { rows: BrandingRow[] };

    return toBranding(result.rows?.[0] ?? null);
  } catch {
    return DEFAULT_BRANDING;
  }
}

export default getBranding;
