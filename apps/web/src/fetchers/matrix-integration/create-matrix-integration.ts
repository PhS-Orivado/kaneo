import { getApiUrl } from "@/fetchers/get-api-url";
import { HttpError } from "@/lib/http-error";
import type { MatrixIntegration } from "./get-matrix-integration";

export type CreateMatrixIntegrationRequest = {
  homeserverUrl: string;
  userId: string;
  accessToken: string;
  spaceNamePrefix?: string;
  inviteUsers?: string[];
  events?: {
    taskCreated?: boolean;
    taskStatusChanged?: boolean;
    taskPriorityChanged?: boolean;
    taskTitleChanged?: boolean;
    taskDescriptionChanged?: boolean;
    taskCommentCreated?: boolean;
  };
};

async function createMatrixIntegration(
  projectId: string,
  json: CreateMatrixIntegrationRequest,
) {
  const response = await fetch(
    getApiUrl(`/matrix-integration/project/${projectId}`),
    {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(json),
    },
  );

  if (!response.ok) {
    throw new HttpError(response.status, await response.text());
  }

  return (await response.json()) as MatrixIntegration;
}

export default createMatrixIntegration;
