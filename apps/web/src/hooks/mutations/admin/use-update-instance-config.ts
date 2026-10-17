import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { updateInstanceConfig } from "@/fetchers/admin/update-instance-config";
import { ADMIN_INSTANCE_CONFIG_QUERY_KEY } from "@/hooks/queries/admin/use-get-instance-config";
import { toast } from "@/lib/toast";

const CONFIG_QUERY_KEY = ["config"] as const;

function useUpdateInstanceConfig() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateInstanceConfig,
    onSuccess: () => {
      toast.success(t("settings:adminInstanceConfig.toast.saved"));
      queryClient.invalidateQueries({
        queryKey: ADMIN_INSTANCE_CONFIG_QUERY_KEY,
      });
      // The public config endpoint reports whether SMTP and image uploads are enabled.
      queryClient.invalidateQueries({ queryKey: CONFIG_QUERY_KEY });
    },
    onError: (error) => {
      toast.error(
        error instanceof Error && error.message
          ? error.message
          : t("settings:adminInstanceConfig.toast.saveError"),
      );
    },
  });
}

export default useUpdateInstanceConfig;
