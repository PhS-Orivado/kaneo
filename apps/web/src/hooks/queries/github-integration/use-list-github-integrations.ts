import { useQuery } from "@tanstack/react-query";
import listGithubIntegrations from "@/fetchers/github-integration/list-github-integrations";

function useListGithubIntegrations(projectId: string) {
  return useQuery({
    queryKey: ["github-integrations", projectId],
    queryFn: () => listGithubIntegrations(projectId),
    enabled: Boolean(projectId),
  });
}

export default useListGithubIntegrations;
