import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";

import { HttpError } from "@/lib/http-error";

// RFC 0001 WP4: deletes are keyed by the integration id. The server removes
// the binding together with its issue links; other bindings of the same
// project keep working, including their webhook routes.
async function deleteGitlabIntegration(integrationId: string) {
  const response = await client["gitlab-integration"].integration[
    ":integrationId"
  ].$delete({
    param: { integrationId },
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

export default deleteGitlabIntegration;
