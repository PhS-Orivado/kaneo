import { client } from "@kaneo/libs";
import type { InferRequestType, InferResponseType } from "hono";
import { HttpError } from "@/lib/http-error";

export type ListJiraProjectsRequest = InferRequestType<
  (typeof client)["jira-integration"]["projects"]["$post"]
>["json"];

export type ListJiraProjectsResponse = InferResponseType<
  (typeof client)["jira-integration"]["projects"]["$post"],
  200
>;

async function listJiraProjects(
  data: ListJiraProjectsRequest,
): Promise<ListJiraProjectsResponse> {
  const response = await client["jira-integration"].projects.$post({
    json: data,
  });

  if (!response.ok) {
    throw new HttpError(
      response.status,
      (await response.text()) || "Request failed",
    );
  }

  return response.json();
}

export default listJiraProjects;
