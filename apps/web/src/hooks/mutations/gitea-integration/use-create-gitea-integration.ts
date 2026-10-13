import { useMutation, useQueryClient } from "@tanstack/react-query";
import createGiteaIntegration, {
  type CreateGiteaIntegrationRequest,
} from "@/fetchers/gitea-integration/create-gitea-integration";
import deleteGiteaIntegration from "@/fetchers/gitea-integration/delete-gitea-integration";
import verifyGiteaAccess, {
  type VerifyGiteaAccessRequest,
} from "@/fetchers/gitea-integration/verify-gitea-access";

export function useCreateGiteaIntegration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      data,
    }: {
      projectId: string;
      data: CreateGiteaIntegrationRequest;
    }) => createGiteaIntegration(projectId, data),
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({
        queryKey: ["gitea-integrations", projectId],
      });
    },
  });
}

// RFC 0001 WP3/WP7: deletes are keyed by the integration id; the binding's
// issue and pull request links disappear with it, so the external-link cache is
// dropped too.
export function useDeleteGiteaIntegration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (integrationId: string) =>
      deleteGiteaIntegration(integrationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gitea-integrations"] });
      queryClient.invalidateQueries({ queryKey: ["external-links"] });
    },
  });
}

export function useVerifyGiteaAccess() {
  return useMutation({
    mutationFn: (data: VerifyGiteaAccessRequest) => verifyGiteaAccess(data),
  });
}
