import { client } from "@kaneo/libs";
import type { InferRequestType } from "hono";
import { HttpError } from "@/lib/http-error";

export type UpdateGitlabIntegrationRequest = InferRequestType<
  (typeof client)["gitlab-integration"]["integration"][":integrationId"]["$patch"]
>["json"];

// RFC 0001 WP4/WP7: updates are keyed by the integration id of the binding
// the row represents; omitted fields keep their current value.
async function updateGitlabIntegration(
  integrationId: string,
  json: UpdateGitlabIntegrationRequest,
) {
  const response = await client["gitlab-integration"].integration[
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

export default updateGitlabIntegration;
