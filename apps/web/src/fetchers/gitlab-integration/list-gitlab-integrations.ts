import { client } from "@kaneo/libs";
import type { InferResponseType } from "hono";
import { HttpError } from "@/lib/http-error";
import { gitlabBindingListSchema } from "@/types/repository-binding";

// RFC 0001 WP4/WP7: the project's GitLab bindings together with the
// workspace's repository binding usage summary (WP10). The response is parsed
// with the shared binding schema so the list shape cannot drift from the row
// type used by the settings list.
export type ListGitlabIntegrationsResponse = InferResponseType<
  (typeof client)["gitlab-integration"]["project"][":projectId"]["integrations"]["$get"],
  200
>;

async function listGitlabIntegrations(projectId: string) {
  const response = await client["gitlab-integration"].project[
    ":projectId"
  ].integrations.$get({ param: { projectId } });

  if (!response.ok) {
    throw new HttpError(response.status, await response.text());
  }

  const data: ListGitlabIntegrationsResponse = await response.json();
  return gitlabBindingListSchema.parse(data);
}

export default listGitlabIntegrations;
