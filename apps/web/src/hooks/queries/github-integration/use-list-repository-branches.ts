import { useQuery } from "@tanstack/react-query";
import listRepositoryBranches from "@/fetchers/github-integration/list-repository-branches";

function useListRepositoryBranches(
  integrationId: string,
  query?: string,
  enabled?: boolean,
) {
  return useQuery({
    queryKey: ["github-repository-branches", integrationId, query ?? ""],
    queryFn: () => listRepositoryBranches(integrationId, query),
    enabled: Boolean(integrationId) && enabled !== false,
    staleTime: 30_000,
  });
}

export default useListRepositoryBranches;
