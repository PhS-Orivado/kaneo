import { useMutation, useQueryClient } from "@tanstack/react-query";
import createGithubIntegration, {
  type CreateGithubIntegrationRequest,
} from "@/fetchers/github-integration/create-github-integration";
import deleteGithubIntegration from "@/fetchers/github-integration/delete-github-integration";
import verifyGithubInstallation, {
  type VerifyGithubInstallationRequest,
} from "@/fetchers/github-integration/verify-github-installation";

export function useCreateGithubIntegration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      data,
    }: {
      projectId: string;
      data: CreateGithubIntegrationRequest;
    }) => createGithubIntegration(projectId, data),
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({
        queryKey: ["github-integrations", projectId],
      });
    },
  });
}

// RFC 0001 WP2/WP7: deletes are keyed by the integration id; the binding's
// external links disappear with it, so the external-link cache is dropped too.
export function useDeleteGithubIntegration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (integrationId: string) => deleteGithubIntegration(integrationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["github-integrations"] });
      queryClient.invalidateQueries({ queryKey: ["external-links"] });
    },
  });
}

export function useVerifyGithubInstallation() {
  return useMutation({
    mutationFn: (data: VerifyGithubInstallationRequest) =>
      verifyGithubInstallation(data),
  });
}
