import { GitBranch, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import useDeleteExternalLink from "@/hooks/mutations/external-link/use-delete-external-link";
import type { ExternalLink } from "@/types/external-link";

type BranchRowProps = {
  taskId: string;
  link: ExternalLink;
  /** Repo identity of the binding the branch belongs to, when known. */
  repoIdentity?: string;
};

export function BranchRow({ taskId, link, repoIdentity }: BranchRowProps) {
  const { t } = useTranslation();
  const deleteExternalLink = useDeleteExternalLink();

  const removable = link.integrationId === null;

  return (
    <div className="flex items-center gap-1">
      <a
        href={link.url}
        target="_blank"
        rel="noopener noreferrer"
        className="group flex min-w-0 flex-1 items-center gap-3 rounded-md px-3 py-2 transition-colors hover:bg-accent/50"
      >
        <GitBranch className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-sm text-foreground/90 group-hover:text-foreground">
          {link.title || link.externalId}
        </span>
        {repoIdentity && (
          <span className="max-w-40 shrink-0 truncate text-xs text-muted-foreground">
            {repoIdentity}
          </span>
        )}
      </a>
      {removable && (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={t("tasks:branches.remove", {
            name: link.title || link.externalId,
          })}
          disabled={deleteExternalLink.isPending}
          onClick={() => deleteExternalLink.mutate({ taskId, id: link.id })}
        >
          <X aria-hidden="true" />
        </Button>
      )}
    </div>
  );
}
