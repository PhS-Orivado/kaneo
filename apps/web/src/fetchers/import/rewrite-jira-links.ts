import { client } from "@kaneo/libs";
import type { InferRequestType, InferResponseType } from "hono";
import { HttpError } from "@/lib/http-error";

export type RewriteJiraLinksRequest = InferRequestType<
  (typeof client)["import"]["jira-links"]["rewrite"]["$post"]
>["json"];

export type RewriteJiraLinksResponse = InferResponseType<
  (typeof client)["import"]["jira-links"]["rewrite"]["$post"],
  200
>;

async function rewriteJiraLinks(
  data: RewriteJiraLinksRequest,
): Promise<RewriteJiraLinksResponse> {
  const response = await client.import["jira-links"].rewrite.$post({
    json: data,
  });

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  return response.json();
}

export default rewriteJiraLinks;
