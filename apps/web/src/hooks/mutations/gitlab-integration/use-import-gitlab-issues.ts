import { useMutation, useQueryClient } from "@tanstack/react-query";
import importGitlabIssues, {
  type ImportGitlabIssuesRequest,
} from "@/fetchers/gitlab-integration/import-gitlab-issues";

// RFC 0001 WP4/WP7: imports are keyed by the integration id of the binding
// row that triggered them.
export default function useImportGitlabIssues() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: ImportGitlabIssuesRequest) => importGitlabIssues(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["gitlab-integrations"] });
    },
  });
}
