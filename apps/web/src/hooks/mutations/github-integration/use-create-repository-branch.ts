import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import createRepositoryBranch from "@/fetchers/github-integration/create-repository-branch";
import { toast } from "@/lib/toast";

function useCreateRepositoryBranch() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: createRepositoryBranch,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["external-links"] });
    },
    onError: () => {
      toast.error(t("tasks:branches.createError"));
    },
  });
}

export default useCreateRepositoryBranch;
