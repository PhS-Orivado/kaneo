import { X } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import type { AddBindingError } from "@/components/project/integration-repositories/add-binding-error";

/**
 * RFC 0001 WP7 D2: an add-flow failure rendered inline where the user acted
 * (the browser modal or an add dialog). The modal stays open; the blocker and
 * the action that resolves it are always shown together. A limit-reached 402
 * adds the upgrade call to action; the message itself is the server's own
 * wording, never a generic failure text.
 */
export function AddBindingErrorAlert({
  error,
  onDismiss,
}: {
  error: AddBindingError;
  onDismiss: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div
      role="alert"
      className="flex items-start justify-between gap-3 rounded-md border border-destructive/25 bg-destructive/10 p-3 text-sm"
    >
      <div className="flex-1 space-y-1">
        <p>{error.message}</p>
        {error.limitReached ? (
          <Link
            to="/dashboard/settings/workspace/billing"
            onClick={onDismiss}
            className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
          >
            {t("settings:repositoryBindings.upgrade")}
          </Link>
        ) : null}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={t("settings:repositoryBindings.dismissError")}
        onClick={onDismiss}
      >
        <X className="size-4" />
      </Button>
    </div>
  );
}
