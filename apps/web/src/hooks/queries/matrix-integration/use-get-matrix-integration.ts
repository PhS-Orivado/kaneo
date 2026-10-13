import { useQuery } from "@tanstack/react-query";
import getMatrixIntegration from "@/fetchers/matrix-integration/get-matrix-integration";

function useGetMatrixIntegration(
  projectId: string,
  { enabled = true }: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: ["matrix-integration", projectId],
    queryFn: () => getMatrixIntegration(projectId),
    enabled: enabled && Boolean(projectId),
  });
}

export default useGetMatrixIntegration;
