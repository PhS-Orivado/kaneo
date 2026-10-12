import { useQuery } from "@tanstack/react-query";
import getSyncRules from "@/fetchers/integration-sync/get-sync-rules";
import {
  syncScopeKey,
  type SyncScope,
} from "@/fetchers/integration-sync/types";

export function useSyncRules(scope: SyncScope, after?: string) {
  const key = syncScopeKey(scope);
  return useQuery({
    queryKey: [
      "integration-sync",
      key.projectId,
      key.provider,
      key.integrationId,
      after ?? "",
    ],
    queryFn: () => getSyncRules(scope, after),
    placeholderData: (previousData, previousQuery) =>
      previousQuery?.queryKey[1] === key.projectId &&
      previousQuery.queryKey[2] === key.provider &&
      previousQuery.queryKey[3] === key.integrationId
        ? previousData
        : undefined,
  });
}
