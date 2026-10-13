import { useQuery } from "@tanstack/react-query";
import listGitlabIntegrations from "@/fetchers/gitlab-integration/list-gitlab-integrations";

function useListGitlabIntegrations(projectId: string) {
  return useQuery({
    queryKey: ["gitlab-integrations", projectId],
    queryFn: () => listGitlabIntegrations(projectId),
    enabled: Boolean(projectId),
  });
}

export default useListGitlabIntegrations;
