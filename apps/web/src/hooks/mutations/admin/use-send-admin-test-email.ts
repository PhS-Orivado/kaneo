import { useMutation, useQueryClient } from "@tanstack/react-query";
import { MailCheckIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { sendAdminTestEmail } from "@/fetchers/admin/send-admin-test-email";
import { ADMIN_AUDIT_LOG_QUERY_KEY } from "@/hooks/queries/admin/use-admin-audit-log";
import { toast } from "@/lib/toast";

function useSendAdminTestEmail() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: sendAdminTestEmail,
    onSuccess: ({ to, response, messageId, elapsedMs }) => {
      void queryClient.invalidateQueries({
        queryKey: ADMIN_AUDIT_LOG_QUERY_KEY,
        refetchType: "all",
      });
      // "Sent" only means the relay accepted the message. Show what the
      // server actually said so acceptance can be checked in its logs.
      const description = [
        response,
        messageId ? `message ${messageId}` : null,
        typeof elapsedMs === "number" ? `${elapsedMs} ms` : null,
      ]
        .filter((part): part is string => Boolean(part))
        .join(" · ");
      toast.success(t("settings:adminSystem.toast.testEmailSent", { to }), {
        icon: MailCheckIcon,
        description: description || undefined,
      });
    },
    onError: (error) => {
      toast.error(
        error instanceof Error && error.message
          ? error.message
          : t("settings:adminSystem.toast.testEmailError"),
      );
    },
  });
}

export default useSendAdminTestEmail;
