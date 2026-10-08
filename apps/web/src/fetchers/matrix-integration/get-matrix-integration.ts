import { getApiUrl } from "@/fetchers/get-api-url";
import { HttpError } from "@/lib/http-error";

export type MatrixIntegration = {
  id: string;
  projectId: string;
  homeserverUrl: string;
  userId: string;
  spaceNamePrefix: string | null;
  inviteUsers: string[];
  tokenConfigured: boolean;
  maskedAccessToken: string;
  events: {
    taskCreated: boolean;
    taskStatusChanged: boolean;
    taskPriorityChanged: boolean;
    taskTitleChanged: boolean;
    taskDescriptionChanged: boolean;
    taskCommentCreated: boolean;
  };
  isActive: boolean | null;
  createdAt: string;
  updatedAt: string;
} | null;

async function getMatrixIntegration(projectId: string) {
  const response = await fetch(
    getApiUrl(`/matrix-integration/project/${projectId}`),
    {
      credentials: "include",
    },
  );

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new HttpError(response.status, await response.text());
  }

  return (await response.json()) as MatrixIntegration;
}

export default getMatrixIntegration;
