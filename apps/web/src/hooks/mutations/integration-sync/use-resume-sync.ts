import { useMutation, useQueryClient } from "@tanstack/react-query";
import resumeSync from "@/fetchers/integration-sync/resume-sync";
import type { SyncScope } from "@/fetchers/integration-sync/types";

export function useResumeSync(scope: SyncScope, linkId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      token,
      source,
    }: {
      token: string;
      source: "kaneo" | "provider";
    }) => resumeSync(scope, linkId, token, source),
    onSuccess: async () => {
      // The sync, preview and review keys share the "integration-sync"
      // prefix, so one invalidation covers the whole surface.
      await client.invalidateQueries({ queryKey: ["integration-sync"] });
      await client.invalidateQueries({ queryKey: ["external-links"] });
      await client.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}
