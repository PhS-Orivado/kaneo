import { useMutation, useQueryClient } from "@tanstack/react-query";
import updateGitlabIntegration, {
  type UpdateGitlabIntegrationRequest,
} from "@/fetchers/gitlab-integration/update-gitlab-integration";

// RFC 0001 WP4/WP7: updates are keyed by the integration id of the binding
// row that triggered them.
export function useUpdateGitlabIntegration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      integrationId,
      json,
    }: {
      integrationId: string;
      json: UpdateGitlabIntegrationRequest;
    }) => updateGitlabIntegration(integrationId, json),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["gitlab-integrations"] });
    },
  });
}
