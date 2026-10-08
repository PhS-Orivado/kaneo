import { useMutation, useQueryClient } from "@tanstack/react-query";
import createJiraIntegration, {
  type CreateJiraIntegrationRequest,
} from "@/fetchers/jira-integration/create-jira-integration";
import deleteJiraIntegration from "@/fetchers/jira-integration/delete-jira-integration";
import verifyJiraAccess, {
  type VerifyJiraAccessRequest,
} from "@/fetchers/jira-integration/verify-jira-access";

export function useCreateJiraIntegration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      projectId,
      data,
    }: {
      projectId: string;
      data: CreateJiraIntegrationRequest;
    }) => createJiraIntegration(projectId, data),
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({
        queryKey: ["jira-integrations", projectId],
      });
    },
  });
}

// Deletes are keyed by the integration id; the binding's issue links
// disappear with it, so the external-link cache is dropped too.
export function useDeleteJiraIntegration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (integrationId: string) =>
      deleteJiraIntegration(integrationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jira-integrations"] });
      queryClient.invalidateQueries({ queryKey: ["external-links"] });
    },
  });
}

export function useVerifyJiraAccess() {
  return useMutation({
    mutationFn: (data: VerifyJiraAccessRequest) => verifyJiraAccess(data),
  });
}
