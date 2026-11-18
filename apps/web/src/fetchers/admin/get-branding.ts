import { client } from "@kaneo/libs";
import type { InferResponseType } from "hono/client";
import { HttpError } from "@/lib/http-error";

export type BrandingSettings = InferResponseType<
  (typeof client)["admin"]["branding"]["$get"],
  200
>;

export async function getBranding(): Promise<BrandingSettings> {
  const response = await client.admin.branding.$get();

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  return response.json();
}
