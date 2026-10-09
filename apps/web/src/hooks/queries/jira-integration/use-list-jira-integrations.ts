import { useQuery } from "@tanstack/react-query";
import listJiraIntegrations from "@/fetchers/jira-integration/list-jira-integrations";

function useListJiraIntegrations(projectId: string) {
  return useQuery({
    queryKey: ["jira-integrations", projectId],
    queryFn: () => listJiraIntegrations(projectId),
    enabled: Boolean(projectId),
  });
}

export default useListJiraIntegrations;
