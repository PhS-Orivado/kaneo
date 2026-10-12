import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog";
import { SyncRulesSection } from "@/components/project/sync-rules/sync-rules-section";
import type { RepositoryBindingRow } from "@/types/repository-binding";

/**
 * RFC 0001 WP5/WP7: the sync rules of one repository binding, addressed by
 * the binding, so a sibling binding's rules, paused links and resume flow are
 * never touched.
 */
export function BindingSyncRulesDialog({
  row,
  onClose,
}: {
  row: RepositoryBindingRow | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();

  return (
    <Dialog
      open={row !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogPopup className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {t("settings:repositoryBindings.syncRulesTitle")}
          </DialogTitle>
          <DialogDescription>
            {t("settings:repositoryBindings.syncRulesHint", {
              repository: row?.identity ?? "",
            })}
          </DialogDescription>
        </DialogHeader>
        <DialogPanel>
          {row ? (
            <SyncRulesSection
              key={row.integrationId}
              scope={{ kind: "binding", integrationId: row.integrationId }}
            />
          ) : null}
        </DialogPanel>
      </DialogPopup>
    </Dialog>
  );
}
