import { useMutation, useQueryClient } from "@tanstack/react-query";
import updateGiteaIntegration, {
  type UpdateGiteaIntegrationRequest,
} from "@/fetchers/gitea-integration/update-gitea-integration";

// RFC 0001 WP3/WP7: updates are keyed by the integration id of the binding
// row that triggered them.
export function useUpdateGiteaIntegration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      integrationId,
      json,
    }: {
      integrationId: string;
      json: UpdateGiteaIntegrationRequest;
    }) => updateGiteaIntegration(integrationId, json),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["gitea-integrations"] });
    },
  });
}
