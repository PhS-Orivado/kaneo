import { LinkIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { SettingsSectionHeader } from "@/components/settings/settings-section-header";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { RewriteJiraLinksResponse } from "@/fetchers/import/rewrite-jira-links";
import useRewriteJiraLinks from "@/hooks/mutations/import/use-rewrite-jira-links";
import { toast } from "@/lib/toast";

type JiraLinkRewriteProps = {
  workspaceId: string;
};

export function JiraLinkRewrite({ workspaceId }: JiraLinkRewriteProps) {
  const { t } = useTranslation();
  const [report, setReport] = useState<RewriteJiraLinksResponse | null>(null);
  const { mutateAsync, isPending, isError, reset } = useRewriteJiraLinks();

  const findLinks = async () => {
    try {
      setReport(
        await mutateAsync({ workspaceId, dryRun: true }),
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("settings:workspaceImport.jiraLinks.loadError"),
      );
    }
  };

  const applyRewrite = async () => {
    try {
      const applied = await mutateAsync({ workspaceId, dryRun: false });

      toast.success(
        t("settings:workspaceImport.jiraLinks.successToast", {
          count: applied.replacements.length,
        }),
        { icon: LinkIcon },
      );
      closeDialog();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("settings:workspaceImport.jiraLinks.applyError"),
      );
    }
  };

  const closeDialog = () => {
    setReport(null);
    reset();
  };

  const replaceable = report?.replacements.length ?? 0;

  return (
    <section className="space-y-3">
      <SettingsSectionHeader
        title={t("settings:workspaceImport.jiraLinks.title")}
        description={t("settings:workspaceImport.jiraLinks.description")}
      />
      <div className="flex items-center gap-3.5 rounded-xl border border-border bg-card px-4 py-3.5">
        <p className="min-w-0 flex-1 text-muted-foreground text-xs">
          {t("settings:workspaceImport.jiraLinks.cardDescription")}
        </p>
        <Button
          variant="outline"
          size="sm"
          className="w-36 shrink-0"
          loading={isPending && !report}
          onClick={findLinks}
        >
          {t("settings:workspaceImport.jiraLinks.find")}
        </Button>
      </div>

      <Dialog
        open={report !== null}
        onOpenChange={(open) => {
          if (!open) closeDialog();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t("settings:workspaceImport.jiraLinks.dialogTitle")}
            </DialogTitle>
            <DialogDescription>
              {t("settings:workspaceImport.jiraLinks.dialogDescription")}
            </DialogDescription>
          </DialogHeader>

          {report ? (
            replaceable > 0 ? (
              <div className="space-y-2">
                <p className="text-sm">
                  {t("settings:workspaceImport.jiraLinks.summary", {
                    count: replaceable,
                    tasks: report.updatedTasks,
                    comments: report.updatedComments,
                  })}
                </p>
                <ul className="max-h-64 space-y-1.5 overflow-y-auto text-xs">
                  {report.replacements.map((replacement) => (
                    <li
                      key={`${replacement.taskId}-${replacement.commentId}-${replacement.sourceUrl}`}
                      className="flex flex-wrap items-baseline gap-x-2"
                    >
                      <span className="font-medium text-foreground">
                        {replacement.targetTicketId}
                      </span>
                      <span className="text-muted-foreground">
                        {replacement.targetTitle}
                      </span>
                      <span className="basis-full break-all text-muted-foreground">
                        {replacement.sourceUrl}
                      </span>
                    </li>
                  ))}
                </ul>
                {report.unresolved.length > 0 ? (
                  <p className="text-muted-foreground text-xs">
                    {t("settings:workspaceImport.jiraLinks.unresolved", {
                      count: report.unresolved.length,
                    })}
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="text-sm">
                {report.unresolved.length > 0
                  ? t("settings:workspaceImport.jiraLinks.noneUnresolved", {
                      count: report.unresolved.length,
                    })
                  : t("settings:workspaceImport.jiraLinks.none")}
              </p>
            )
          ) : null}

          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={closeDialog}>
              {t("common:actions.cancel")}
            </Button>
            <Button
              size="sm"
              disabled={replaceable === 0 || isPending}
              loading={isPending}
              onClick={applyRewrite}
            >
              {t("settings:workspaceImport.jiraLinks.apply", {
                count: replaceable,
              })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {isError ? (
        <p role="alert" className="text-muted-foreground text-xs">
          {t("settings:workspaceImport.jiraLinks.loadError")}
        </p>
      ) : null}
    </section>
  );
}
