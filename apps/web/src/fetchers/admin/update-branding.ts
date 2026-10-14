import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";
import type { BrandingSettings } from "./get-branding";

export async function updateBranding(
  branding: BrandingSettings,
): Promise<BrandingSettings> {
  const response = await client.admin.branding.$put({ json: branding });

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  return response.json();
}
