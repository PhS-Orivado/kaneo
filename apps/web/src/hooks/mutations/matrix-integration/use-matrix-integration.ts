import { useMutation, useQueryClient } from "@tanstack/react-query";
import createMatrixIntegration, {
  type CreateMatrixIntegrationRequest,
} from "@/fetchers/matrix-integration/create-matrix-integration";
import deleteMatrixIntegration from "@/fetchers/matrix-integration/delete-matrix-integration";
import updateMatrixIntegration, {
  type UpdateMatrixIntegrationRequest,
} from "@/fetchers/matrix-integration/update-matrix-integration";

export function useCreateMatrixIntegration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      data,
    }: {
      projectId: string;
      data: CreateMatrixIntegrationRequest;
    }) => createMatrixIntegration(projectId, data),
    onSuccess: (_, { projectId }) => {
      void queryClient.invalidateQueries({
        queryKey: ["matrix-integration", projectId],
      });
    },
  });
}

export function useUpdateMatrixIntegration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      json,
    }: {
      projectId: string;
      json: UpdateMatrixIntegrationRequest;
    }) => updateMatrixIntegration(projectId, json),
    onSuccess: (_, { projectId }) => {
      void queryClient.invalidateQueries({
        queryKey: ["matrix-integration", projectId],
      });
    },
  });
}

export function useDeleteMatrixIntegration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (projectId: string) => deleteMatrixIntegration(projectId),
    onSuccess: (_, projectId) => {
      void queryClient.invalidateQueries({
        queryKey: ["matrix-integration", projectId],
      });
    },
  });
}
