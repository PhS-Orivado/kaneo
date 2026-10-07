import { client } from "@kaneo/libs";
import type { InferResponseType } from "hono";
import { HttpError } from "@/lib/http-error";
import { githubBindingListSchema } from "@/types/repository-binding";

// RFC 0001 WP2/WP7: the project's GitHub bindings together with the
// workspace's repository binding usage summary (WP10). The response is parsed
// with the shared binding schema so the list shape cannot drift from the row
// type used by the settings list.
export type ListGithubIntegrationsResponse = InferResponseType<
  (typeof client)["github-integration"]["project"][":projectId"]["integrations"]["$get"],
  200
>;

async function listGithubIntegrations(projectId: string) {
  const response = await client["github-integration"].project[
    ":projectId"
  ].integrations.$get({ param: { projectId } });

  if (!response.ok) {
    throw new HttpError(response.status, await response.text());
  }

  const data: ListGithubIntegrationsResponse = await response.json();
  return githubBindingListSchema.parse(data);
}

export default listGithubIntegrations;
