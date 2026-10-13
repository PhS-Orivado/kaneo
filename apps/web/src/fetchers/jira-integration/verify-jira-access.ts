import { client } from "@kaneo/libs";
import type { InferRequestType, InferResponseType } from "hono";
import { HttpError } from "@/lib/http-error";

export type VerifyJiraAccessRequest = InferRequestType<
  (typeof client)["jira-integration"]["verify"]["$post"]
>["json"];

export type VerifyJiraAccessResponse = InferResponseType<
  (typeof client)["jira-integration"]["verify"]["$post"],
  200
>;

async function verifyJiraAccess(
  data: VerifyJiraAccessRequest,
): Promise<VerifyJiraAccessResponse> {
  const response = await client["jira-integration"].verify.$post({
    json: data,
  });

  if (!response.ok) {
    const error = await response
      .clone()
      .json()
      .catch(async () => ({
        message: (await response.text()) || "Request failed",
      }));
    throw new HttpError(
      response.status,
      typeof error === "object" && error && "message" in error
        ? String((error as { message: string }).message)
        : "Request failed",
    );
  }

  return response.json();
}

export default verifyJiraAccess;
