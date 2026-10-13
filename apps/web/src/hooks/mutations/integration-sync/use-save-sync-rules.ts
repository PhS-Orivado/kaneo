import { useMutation, useQueryClient } from "@tanstack/react-query";
import saveSyncRules from "@/fetchers/integration-sync/save-sync-rules";
import type { SyncRules, SyncScope } from "@/fetchers/integration-sync/types";

export function useSaveSyncRules(scope: SyncScope) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      rules,
      previewToken,
    }: {
      rules: SyncRules;
      previewToken: string;
    }) => saveSyncRules(scope, rules, previewToken),
    onSuccess: async () => {
      // The sync, preview and review keys share the "integration-sync"
      // prefix, so one invalidation covers the whole surface.
      await client.invalidateQueries({ queryKey: ["integration-sync"] });
      await client.invalidateQueries({ queryKey: ["external-links"] });
    },
  });
}
