import { client } from "@kaneo/libs";
import type { InferRequestType, InferResponseType } from "hono";
import { HttpError } from "@/lib/http-error";

export type ImportGiteaIssuesRequest = InferRequestType<
  (typeof client)["gitea-integration"]["import-issues"]["$post"]
>["json"];
export type ImportGiteaIssuesResponse = InferResponseType<
  (typeof client)["gitea-integration"]["import-issues"]["$post"],
  200
>;

// RFC 0001 WP3/WP7: imports are keyed by the integration id of the binding
// whose repository is imported. A projectId in the body is accepted for
// compat and must match the binding's project.
async function importGiteaIssues(data: ImportGiteaIssuesRequest) {
  const response = await client["gitea-integration"]["import-issues"].$post({
    json: data,
  });

  if (!response.ok) {
    throw new HttpError(response.status, await response.text());
  }

  return response.json();
}

export default importGiteaIssues;
