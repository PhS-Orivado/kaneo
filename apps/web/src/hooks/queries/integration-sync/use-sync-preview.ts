import { useQuery } from "@tanstack/react-query";
import previewSyncRules from "@/fetchers/integration-sync/preview-sync-rules";
import {
  syncScopeKey,
  type SyncRules,
  type SyncScope,
} from "@/fetchers/integration-sync/types";

export function useSyncPreview(
  scope: SyncScope,
  rules: SyncRules,
  enabled: boolean,
) {
  const key = syncScopeKey(scope);
  return useQuery({
    queryKey: [
      "integration-sync-preview",
      key.projectId,
      key.provider,
      key.integrationId,
      rules,
    ],
    queryFn: () => previewSyncRules(scope, rules),
    enabled,
    retry: false,
    staleTime: 0,
  });
}
