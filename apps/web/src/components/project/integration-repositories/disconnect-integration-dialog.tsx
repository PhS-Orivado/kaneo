import { useTranslation } from "react-i18next";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { PROVIDER_METADATA } from "@/components/project/integration-repositories/provider-metadata";
import type { RepositoryBindingRow } from "@/types/repository-binding";

type DisconnectIntegrationDialogProps = {
  row: RepositoryBindingRow | null;
  isPending: boolean;
  onConfirm: (row: RepositoryBindingRow) => void;
  onCancel: () => void;
};

/**
 * RFC 0001 WP7: disconnects are confirmed with an AlertDialog, never a toast.
 * The copy states exactly what the server removes: the binding, its external
 * links, and its import state; tasks created from its issues remain.
 */
export function DisconnectIntegrationDialog({
  row,
  isPending,
  onConfirm,
  onCancel,
}: DisconnectIntegrationDialogProps) {
  const { t } = useTranslation();
  const provider = row ? PROVIDER_METADATA[row.provider].namespace : null;

  return (
    <AlertDialog
      open={row !== null}
      onOpenChange={(open) => {
        if (!open && !isPending) onCancel();
      }}
    >
      <AlertDialogPopup>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("settings:repositoryBindings.disconnectTitle")}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("settings:repositoryBindings.disconnectDescription", {
              repository: row?.identity ?? "",
              provider: provider
                ? t(`settings:${provider}.providerName`)
                : "",
            })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogClose render={<Button type="button" variant="ghost" />}>
            {t("common:actions.cancel")}
          </AlertDialogClose>
          <Button
            type="button"
            variant="destructive"
            disabled={isPending}
            onClick={() => row && onConfirm(row)}
          >
            {isPending
              ? t("settings:repositoryBindings.disconnectWorking")
              : t("settings:repositoryBindings.disconnectConfirm")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogPopup>
    </AlertDialog>
  );
}
