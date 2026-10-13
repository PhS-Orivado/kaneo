import { useMutation, useQueryClient } from "@tanstack/react-query";
import updateJiraIntegration, {
  type UpdateJiraIntegrationRequest,
} from "@/fetchers/jira-integration/update-jira-integration";

// Updates are keyed by the integration id of the binding row that
// triggered them.
export function useUpdateJiraIntegration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      integrationId,
      json,
    }: {
      integrationId: string;
      json: UpdateJiraIntegrationRequest;
    }) => updateJiraIntegration(integrationId, json),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["jira-integrations"] });
    },
  });
}
