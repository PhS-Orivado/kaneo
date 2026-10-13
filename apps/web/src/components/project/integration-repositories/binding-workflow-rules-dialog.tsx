import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog";
import { WorkflowRulesPanel } from "@/components/project/workflow-rules-panel";
import type { RepositoryBindingRow } from "@/types/repository-binding";

/**
 * RFC 0001 WP6/WP7: the workflow rules of one repository binding. Writes are
 * scoped to the binding; the panel falls back to the type-wide rule until a
 * repository-specific rule exists.
 */
export function BindingWorkflowRulesDialog({
  row,
  projectId,
  onClose,
}: {
  row: RepositoryBindingRow | null;
  projectId: string;
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
            {t("settings:repositoryBindings.workflowRulesTitle")}
          </DialogTitle>
          <DialogDescription>
            {t("settings:repositoryBindings.workflowRulesHint", {
              repository: row?.identity ?? "",
            })}
          </DialogDescription>
        </DialogHeader>
        <DialogPanel>
          {row ? (
            <WorkflowRulesPanel
              key={row.integrationId}
              projectId={projectId}
              integrationType={row.provider}
              integrationId={row.integrationId}
            />
          ) : null}
        </DialogPanel>
      </DialogPopup>
    </Dialog>
  );
}
