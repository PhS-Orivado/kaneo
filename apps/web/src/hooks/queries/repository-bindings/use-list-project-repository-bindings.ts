import { useQuery } from "@tanstack/react-query";
import listProjectRepositoryBindings from "@/fetchers/repository-bindings/list-project-repository-bindings";

function useListProjectRepositoryBindings(projectId: string) {
  return useQuery({
    queryKey: ["repository-bindings", projectId],
    queryFn: () => listProjectRepositoryBindings(projectId),
    enabled: Boolean(projectId),
  });
}

export default useListProjectRepositoryBindings;
