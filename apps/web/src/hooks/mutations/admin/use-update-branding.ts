import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { updateBranding } from "@/fetchers/admin/update-branding";
import { ADMIN_BRANDING_QUERY_KEY } from "@/hooks/queries/admin/use-get-branding";
import { toast } from "@/lib/toast";

const CONFIG_QUERY_KEY = ["config"] as const;

function useUpdateBranding() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateBranding,
    onSuccess: () => {
      toast.success(t("settings:adminBranding.toast.saved"));
      queryClient.invalidateQueries({ queryKey: ADMIN_BRANDING_QUERY_KEY });
      // The public config endpoint carries branding to the whole app.
      queryClient.invalidateQueries({ queryKey: CONFIG_QUERY_KEY });
    },
    onError: (error) => {
      toast.error(
        error instanceof Error && error.message
          ? error.message
          : t("settings:adminBranding.toast.saveError"),
      );
    },
  });
}

export default useUpdateBranding;
