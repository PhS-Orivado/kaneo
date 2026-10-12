import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";
import type { InferRequestType, InferResponseType } from "hono";

export type ImportGitlabIssuesRequest = InferRequestType<
  (typeof client)["gitlab-integration"]["import-issues"]["$post"]
>["json"];
export type ImportGitlabIssuesResponse = InferResponseType<
  (typeof client)["gitlab-integration"]["import-issues"]["$post"],
  200
>;

// RFC 0001 WP4/WP7: imports are keyed by the integration id of the binding
// whose project is imported. A projectId in the body is accepted for compat
// and must match the binding's project.
async function importGitlabIssues(data: ImportGitlabIssuesRequest) {
  const response = await client["gitlab-integration"]["import-issues"].$post({
    json: data,
  });

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  return response.json();
}

export default importGitlabIssues;
