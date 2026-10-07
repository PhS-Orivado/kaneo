import { useMutation, useQueryClient } from "@tanstack/react-query";
import updateGithubIntegration, {
  type UpdateGithubIntegrationRequest,
} from "@/fetchers/github-integration/update-github-integration";

// RFC 0001 WP2/WP7: updates are keyed by the integration id of the binding
// row that triggered them.
export function useUpdateGithubIntegration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      integrationId,
      json,
    }: {
      integrationId: string;
      json: UpdateGithubIntegrationRequest;
    }) => updateGithubIntegration(integrationId, json),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["github-integrations"] });
    },
  });
}
