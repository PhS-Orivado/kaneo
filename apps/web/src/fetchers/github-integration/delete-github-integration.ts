import { client } from "@kaneo/libs";

import { HttpError } from "@/lib/http-error";

// RFC 0001 WP2: deletes are keyed by the integration id. The server removes
// the binding together with its external links; other bindings of the same
// repository keep working.
async function deleteGithubIntegration(integrationId: string) {
  const response = await client["github-integration"].integration[
    ":integrationId"
  ].$delete({
    param: { integrationId },
  });

  if (!response.ok) {
    throw new HttpError(response.status, await response.text());
  }

  return response.json();
}

export default deleteGithubIntegration;
