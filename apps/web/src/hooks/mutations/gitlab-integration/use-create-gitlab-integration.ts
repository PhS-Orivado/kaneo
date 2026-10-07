import { useMutation, useQueryClient } from "@tanstack/react-query";
import createGitlabIntegration, {
  type CreateGitlabIntegrationRequest,
} from "@/fetchers/gitlab-integration/create-gitlab-integration";
import deleteGitlabIntegration from "@/fetchers/gitlab-integration/delete-gitlab-integration";
import verifyGitlabAccess, {
  type VerifyGitlabAccessRequest,
} from "@/fetchers/gitlab-integration/verify-gitlab-access";

export function useCreateGitlabIntegration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      data,
    }: {
      projectId: string;
      data: CreateGitlabIntegrationRequest;
    }) => createGitlabIntegration(projectId, data),
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({
        queryKey: ["gitlab-integrations", projectId],
      });
    },
  });
}

// RFC 0001 WP4/WP7: deletes are keyed by the integration id; the binding's
// issue links disappear with it, so the external-link cache is dropped too.
export function useDeleteGitlabIntegration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (integrationId: string) => deleteGitlabIntegration(integrationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gitlab-integrations"] });
      queryClient.invalidateQueries({ queryKey: ["external-links"] });
    },
  });
}

export function useVerifyGitlabAccess() {
  return useMutation({
    mutationFn: (data: VerifyGitlabAccessRequest) => verifyGitlabAccess(data),
  });
}
