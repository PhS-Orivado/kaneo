import { useMutation, useQueryClient } from "@tanstack/react-query";
import importGiteaIssues, {
  type ImportGiteaIssuesRequest,
} from "@/fetchers/gitea-integration/import-gitea-issues";

// RFC 0001 WP3/WP7: imports are keyed by the integration id of the binding
// row that triggered them.
export default function useImportGiteaIssues() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: ImportGiteaIssuesRequest) => importGiteaIssues(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["gitea-integrations"] });
    },
  });
}
