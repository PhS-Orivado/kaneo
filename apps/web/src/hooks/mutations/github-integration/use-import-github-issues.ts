import { useMutation } from "@tanstack/react-query";
import importGithubIssues, {
  type ImportGithubIssuesRequest,
} from "@/fetchers/github-integration/import-github-issues";
import queryClient from "@/query-client";

// RFC 0001 WP2/WP7: imports are keyed by the integration id of the binding
// row that triggered them; the fetcher continues 202 pages by runId.
function useImportGithubIssues() {
  return useMutation({
    mutationFn: importGithubIssues,
    onSettled: async (_data, _error, variables: ImportGithubIssuesRequest) => {
      // A failed request can follow successfully persisted pages.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["tasks"] }),
        queryClient.invalidateQueries({ queryKey: ["labels"] }),
        queryClient.invalidateQueries({ queryKey: ["projects"] }),
        queryClient.invalidateQueries({ queryKey: ["assigned-tasks"] }),
        queryClient.invalidateQueries({ queryKey: ["workspace-activity"] }),
        queryClient.invalidateQueries({
          queryKey: [
            "github-integrations",
            variables.projectId ?? "",
          ],
        }),
      ]);
    },
  });
}

export default useImportGithubIssues;
