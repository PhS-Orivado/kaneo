import { client } from "@kaneo/libs";
import type { InferResponseType } from "hono";
import { HttpError } from "@/lib/http-error";
import { giteaBindingListSchema } from "@/types/repository-binding";

// RFC 0001 WP3/WP7: the project's Gitea bindings together with the
// workspace's repository binding usage summary (WP10). The response is parsed
// with the shared binding schema so the list shape cannot drift from the row
// type used by the settings list.
export type ListGiteaIntegrationsResponse = InferResponseType<
  (typeof client)["gitea-integration"]["project"][":projectId"]["integrations"]["$get"],
  200
>;

async function listGiteaIntegrations(projectId: string) {
  const response = await client["gitea-integration"].project[
    ":projectId"
  ].integrations.$get({ param: { projectId } });

  if (!response.ok) {
    throw new HttpError(response.status, await response.text());
  }

  const data: ListGiteaIntegrationsResponse = await response.json();
  return giteaBindingListSchema.parse(data);
}

export default listGiteaIntegrations;
