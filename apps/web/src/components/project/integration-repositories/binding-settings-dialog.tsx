import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/lib/toast";
import type { RepositoryBindingRow } from "@/types/repository-binding";

type BindingSettingsDialogProps = {
  row: RepositoryBindingRow | null;
  isUpdating: boolean;
  onCommentTaskLinkChange: (
    row: RepositoryBindingRow,
    checked: boolean,
  ) => void;
  onClose: () => void;
};

/**
 * RFC 0001 WP7: the settings dialog of one repository binding. The switch
 * writes the provider-specific commentTaskLink flag through the integration
 * id; the webhook section shows the values to paste into the instance. The
 * secret is only present for callers with workspace:manage_settings.
 */
export function BindingSettingsDialog({
  row,
  isUpdating,
  onCommentTaskLinkChange,
  onClose,
}: BindingSettingsDialogProps) {
  const { t } = useTranslation();
  const [showSecret, setShowSecret] = useState(false);

  // A different row must never inherit another binding's revealed secret.
  useEffect(() => {
    setShowSecret(false);
  }, [row?.integrationId]);

  const handleCopySecret = async () => {
    if (!row?.webhookSecret) {
      return;
    }
    try {
      await navigator.clipboard.writeText(row.webhookSecret);
      toast.success(t("settings:repositoryBindings.toast.secretCopied"));
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("settings:repositoryBindings.toast.unableToCopySecret"),
      );
    }
  };

  return (
    <Dialog
      open={row !== null}
      onOpenChange={(open) => {
        if (!open && !isUpdating) onClose();
      }}
    >
      <DialogPopup className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {t("settings:repositoryBindings.settingsTitle")}
          </DialogTitle>
          <DialogDescription className="font-mono">
            {row?.identity ?? ""}
          </DialogDescription>
        </DialogHeader>
        <DialogPanel>
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className="text-sm font-medium">
                  {t("settings:repositoryBindings.commentTaskLinkTitle")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("settings:repositoryBindings.commentTaskLinkHint")}
                </p>
              </div>
              <Switch
                checked={row?.commentTaskLink !== false}
                onCheckedChange={(checked) => {
                  if (row) onCommentTaskLinkChange(row, checked);
                }}
                disabled={isUpdating || !row}
              />
            </div>

            {row?.webhookUrl ? (
              <>
                <Separator />
                <div className="space-y-2 text-xs">
                  <p className="text-sm font-medium">
                    {t("settings:repositoryBindings.webhookTitle")}
                  </p>
                  <p className="text-muted-foreground">
                    {t("settings:repositoryBindings.webhookHint")}
                  </p>
                  <code className="block break-all rounded bg-muted px-2 py-1 text-[11px]">
                    {row.webhookUrl}
                  </code>
                  {row.webhookSecret ? (
                    <>
                      <p className="mt-2 text-muted-foreground">
                        {t("settings:repositoryBindings.webhookSecretLabel")}
                      </p>
                      <div className="flex items-start gap-2">
                        <code className="block flex-1 break-all rounded bg-muted px-2 py-1 text-[11px]">
                          {showSecret
                            ? row.webhookSecret
                            : "••••••••••••••••••••••••••••••••"}
                        </code>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setShowSecret((current) => !current)}
                        >
                          {showSecret
                            ? t("settings:repositoryBindings.webhookHide")
                            : t("settings:repositoryBindings.webhookShow")}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => void handleCopySecret()}
                        >
                          {t("settings:repositoryBindings.webhookCopy")}
                        </Button>
                      </div>
                    </>
                  ) : null}
                </div>
              </>
            ) : null}
          </div>
        </DialogPanel>
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" />}>
            {t("common:actions.close")}
          </DialogClose>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
