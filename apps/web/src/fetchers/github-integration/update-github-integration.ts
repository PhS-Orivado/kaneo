import { client } from "@kaneo/libs";
import type { InferRequestType } from "hono";
import { HttpError } from "@/lib/http-error";

export type UpdateGithubIntegrationRequest = InferRequestType<
  (typeof client)["github-integration"]["integration"][":integrationId"]["$patch"]
>["json"];

// RFC 0001 WP2/WP7: updates are keyed by the integration id of the binding
// the row represents; omitted fields keep their current value.
async function updateGithubIntegration(
  integrationId: string,
  json: UpdateGithubIntegrationRequest,
) {
  const response = await client["github-integration"].integration[
    ":integrationId"
  ].$patch({
    param: { integrationId },
    json,
  });

  if (!response.ok) {
    throw new HttpError(response.status, await response.text());
  }

  return response.json();
}

export default updateGithubIntegration;
