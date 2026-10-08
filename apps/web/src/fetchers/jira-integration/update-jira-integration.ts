import { client } from "@kaneo/libs";
import type { InferRequestType } from "hono";
import { HttpError } from "@/lib/http-error";

export type UpdateJiraIntegrationRequest = InferRequestType<
  (typeof client)["jira-integration"]["integration"][":integrationId"]["$patch"]
>["json"];

// Updates are keyed by the integration id of the binding the row
// represents; omitted fields keep their current value.
async function updateJiraIntegration(
  integrationId: string,
  json: UpdateJiraIntegrationRequest,
) {
  const response = await client["jira-integration"].integration[
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

export default updateJiraIntegration;
