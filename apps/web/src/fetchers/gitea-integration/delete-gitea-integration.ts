import { client } from "@kaneo/libs";

import { HttpError } from "@/lib/http-error";

// RFC 0001 WP3: deletes are keyed by the integration id. The server removes
// the binding together with its issue and pull request links; other bindings
// of the same repository keep working, including their webhook routes.
async function deleteGiteaIntegration(integrationId: string) {
  const response = await client["gitea-integration"].integration[
    ":integrationId"
  ].$delete({
    param: { integrationId },
  });

  if (!response.ok) {
    throw new HttpError(response.status, await response.text());
  }

  return response.json();
}

export default deleteGiteaIntegration;
