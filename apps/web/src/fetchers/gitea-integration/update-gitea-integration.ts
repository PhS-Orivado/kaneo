import { client } from "@kaneo/libs";
import type { InferRequestType } from "hono";
import { HttpError } from "@/lib/http-error";

export type UpdateGiteaIntegrationRequest = InferRequestType<
  (typeof client)["gitea-integration"]["integration"][":integrationId"]["$patch"]
>["json"];

// RFC 0001 WP3/WP7: updates are keyed by the integration id of the binding
// the row represents; omitted fields keep their current value.
async function updateGiteaIntegration(
  integrationId: string,
  json: UpdateGiteaIntegrationRequest,
) {
  const response = await client["gitea-integration"].integration[
    ":integrationId"
  ].$patch({
    param: { integrationId },
    json,
  });

  if (!response.ok) {
<<<<<<< HEAD
    throw await HttpError.fromResponse(response);
=======
    throw new HttpError(response.status, await response.text());
>>>>>>> 0d3149e38b9ca5b66b6f032dce0422cc354a3250
  }

  return response.json();
}

export default updateGiteaIntegration;
