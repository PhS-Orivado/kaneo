import { getApiUrl } from "@/fetchers/get-api-url";
import { HttpError } from "@/lib/http-error";
import type { MatrixIntegration } from "./get-matrix-integration";

export type UpdateMatrixIntegrationRequest = {
  homeserverUrl?: string;
  userId?: string;
  accessToken?: string;
  spaceNamePrefix?: string | null;
  inviteUsers?: string[] | null;
  isActive?: boolean;
  events?: {
    taskCreated?: boolean;
    taskStatusChanged?: boolean;
    taskPriorityChanged?: boolean;
    taskTitleChanged?: boolean;
    taskDescriptionChanged?: boolean;
    taskCommentCreated?: boolean;
  };
};

async function updateMatrixIntegration(
  projectId: string,
  json: UpdateMatrixIntegrationRequest,
) {
  const response = await fetch(
    getApiUrl(`/matrix-integration/project/${projectId}`),
    {
      method: "PATCH",
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

export default updateMatrixIntegration;
