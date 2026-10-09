import { client } from "@kaneo/libs";

import { HttpError } from "@/lib/http-error";

export type CreateJiraIntegrationRequest = {
  baseUrl: string;
  authMode: "cloud" | "dc";
  email?: string;
  apiToken?: string;
  projectKey: string;
  issueType?: string;
  statusMap?: Record<string, string>;
};

async function createJiraIntegration(
  projectId: string,
  data: CreateJiraIntegrationRequest,
) {
  const response = await client["jira-integration"].project[":projectId"].$post(
    {
      param: { projectId },
      json: data,
    },
  );

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
        ? String(error.message)
        : "Request failed",
    );
  }

  return response.json();
}

export default createJiraIntegration;
