import { useMutation, useQueryClient } from "@tanstack/react-query";
import importJiraIssues, {
  type ImportJiraIssuesRequest,
} from "@/fetchers/jira-integration/import-jira-issues";

// Imports are keyed by the integration id of the binding row that
// triggered them.
export default function useImportJiraIssues() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: ImportJiraIssuesRequest) => importJiraIssues(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["jira-integrations"] });
    },
  });
}
