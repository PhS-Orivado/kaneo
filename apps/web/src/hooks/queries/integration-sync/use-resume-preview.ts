import { useQuery } from "@tanstack/react-query";
import reviewSyncResume from "@/fetchers/integration-sync/review-sync-resume";
import { syncScopeKey, type SyncScope } from "@/fetchers/integration-sync/types";

export function useResumePreview(
  scope: SyncScope,
  linkId: string,
  taskId: string,
) {
  const key = syncScopeKey(scope);
  return useQuery({
    queryKey: [
      "integration-sync-review",
      key.projectId,
      key.provider,
      key.integrationId,
      linkId,
    ],
    queryFn: ({ signal }) => reviewSyncResume(scope, linkId, signal),
    meta: { taskId },
    retry: false,
    staleTime: 0,
  });
}
