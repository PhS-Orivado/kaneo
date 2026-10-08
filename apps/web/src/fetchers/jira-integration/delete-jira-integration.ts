import { client } from "@kaneo/libs";

import { HttpError } from "@/lib/http-error";

// Deletes are keyed by the integration id. The server removes the binding
// together with its issue links; other bindings of the same Jira project
// keep working, including their webhook routes.
async function deleteJiraIntegration(integrationId: string) {
  const response = await client["jira-integration"].integration[
    ":integrationId"
  ].$delete({
    param: { integrationId },
  });

  if (!response.ok) {
    throw new HttpError(response.status, await response.text());
  }

  return response.json();
}

export default deleteJiraIntegration;
