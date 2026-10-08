import { getApiUrl } from "@/fetchers/get-api-url";
import { HttpError } from "@/lib/http-error";

export type MatrixConnectionMode = "provision" | "existing";

export type MatrixIntegrationEvents = {
  taskCreated: boolean;
  taskStatusChanged: boolean;
  taskPriorityChanged: boolean;
  taskTitleChanged: boolean;
  taskDescriptionChanged: boolean;
  taskCommentCreated: boolean;
  taskDeleted: boolean;
  taskMoved: boolean;
  taskDueDateChanged: boolean;
  taskAssigneeChanged: boolean;
  taskUnassigned: boolean;
};

export type MatrixIntegration = {
  id: string;
  projectId: string;
  mode: MatrixConnectionMode;
  homeserverUrl: string;
  botUserId: string | null;
  spaceNamePrefix: string | null;
  inviteUsers: string[];
  parentSpaceId: string | null;
  spaceId: string | null;
  updatesRoomId: string | null;
  generalRoomId: string | null;
  roomId: string | null;
  tokenConfigured: boolean;
  maskedAccessToken: string;
  events: MatrixIntegrationEvents;
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
