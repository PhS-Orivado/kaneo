import { client } from "@kaneo/libs";
import type { InferRequestType, InferResponseType } from "hono";
import { HttpError } from "@/lib/http-error";

export type ImportJiraIssuesRequest = InferRequestType<
  (typeof client)["jira-integration"]["import-issues"]["$post"]
>["json"];
export type ImportJiraIssuesResponse = InferResponseType<
  (typeof client)["jira-integration"]["import-issues"]["$post"],
  200
>;

// Imports are keyed by the integration id of the binding whose Jira
// project is imported. A projectId in the body is accepted for compat and
// must match the binding's project.
async function importJiraIssues(data: ImportJiraIssuesRequest) {
  const response = await client["jira-integration"]["import-issues"].$post({
    json: data,
  });

  if (!response.ok) {
    throw new HttpError(response.status, await response.text());
  }

  return response.json();
}

export default importJiraIssues;
