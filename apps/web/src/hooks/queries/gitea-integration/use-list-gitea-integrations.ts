import { useQuery } from "@tanstack/react-query";
import listGiteaIntegrations from "@/fetchers/gitea-integration/list-gitea-integrations";

function useListGiteaIntegrations(projectId: string) {
  return useQuery({
    queryKey: ["gitea-integrations", projectId],
    queryFn: () => listGiteaIntegrations(projectId),
    enabled: Boolean(projectId),
  });
}

export default useListGiteaIntegrations;
