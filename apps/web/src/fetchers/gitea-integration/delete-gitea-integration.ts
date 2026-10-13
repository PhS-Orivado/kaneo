import { client } from "@kaneo/libs";

import { HttpError } from "@/lib/http-error";

// RFC 0001 WP3: deletes are keyed by the integration id. The server removes
// the binding together with its issue and pull request links; other bindings
// of the same repository keep working, including their webhook routes.
  ].$delete({
    param: { projectId },
  });

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  return response.json();
}

export default deleteGiteaIntegration;
