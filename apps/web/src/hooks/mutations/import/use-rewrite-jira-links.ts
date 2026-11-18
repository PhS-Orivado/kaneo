import { useMutation, useQueryClient } from "@tanstack/react-query";
import rewriteJiraLinks, {
  type RewriteJiraLinksRequest,
} from "@/fetchers/import/rewrite-jira-links";

function useRewriteJiraLinks() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: RewriteJiraLinksRequest) => rewriteJiraLinks(data),
    gcTime: 0,
    onSuccess: (report) => {
      if (report.dryRun) return;

      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["activities"] });
    },
  });
}

export default useRewriteJiraLinks;
