import { sql } from "drizzle-orm";
import db from "../database";
import getBranding, { type Branding } from "./get-branding";

export async function updateBranding(
  branding: Branding,
): Promise<Branding> {
  await db.execute(sql`
    INSERT INTO instance_branding (
      id, app_name, logo_light_url, logo_dark_url, accent_color,
      footer_text, footer_url, terms_url, privacy_url, show_powered_by, updated_at
    )
    VALUES (
      'default', ${branding.appName}, ${branding.logoLightUrl}, ${branding.logoDarkUrl},
      ${branding.accentColor}, ${branding.footerText}, ${branding.footerUrl},
      ${branding.termsUrl}, ${branding.privacyUrl}, ${branding.showPoweredBy},
      (now() AT TIME ZONE 'utc')
    )
    ON CONFLICT (id) DO UPDATE SET
      app_name = EXCLUDED.app_name,
      logo_light_url = EXCLUDED.logo_light_url,
      logo_dark_url = EXCLUDED.logo_dark_url,
      accent_color = EXCLUDED.accent_color,
      footer_text = EXCLUDED.footer_text,
      footer_url = EXCLUDED.footer_url,
      terms_url = EXCLUDED.terms_url,
      privacy_url = EXCLUDED.privacy_url,
      show_powered_by = EXCLUDED.show_powered_by,
      updated_at = (now() AT TIME ZONE 'utc')
  `);

  return getBranding();
}

export default updateBranding;
