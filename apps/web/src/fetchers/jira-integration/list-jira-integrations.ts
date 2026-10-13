import { client } from "@kaneo/libs";
import type { InferResponseType } from "hono";
import { HttpError } from "@/lib/http-error";
import { jiraBindingListSchema } from "@/types/repository-binding";

// The project's Jira bindings together with the workspace's repository
// binding usage summary. The response is parsed with the shared binding
// schema so the list shape cannot drift from the row type used by the
// settings list.
export type ListJiraIntegrationsResponse = InferResponseType<
  (typeof client)["jira-integration"]["project"][":projectId"]["integrations"]["$get"],
  200
>;

async function listJiraIntegrations(projectId: string) {
  const response = await client["jira-integration"].project[
    ":projectId"
  ].integrations.$get({ param: { projectId } });

  if (!response.ok) {
    throw new HttpError(response.status, await response.text());
  }

  const data: ListJiraIntegrationsResponse = await response.json();
  return jiraBindingListSchema.parse(data);
}

export default listJiraIntegrations;
