import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import useCreateExternalLink from "@/hooks/mutations/external-link/use-create-external-link";

type PastePrLinkDialogProps = {
  open: boolean;
  onClose: () => void;
  taskId: string;
};

/**
 * Paste a pull request URL (GitHub, Gitea, GitLab) to attach it to the task.
 * The API classifies the pasted URL as a pull request link.
 */
export function PastePrLinkDialog({
  open,
  onClose,
  taskId,
}: PastePrLinkDialogProps) {
  const { t } = useTranslation();
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const createExternalLink = useCreateExternalLink();

  const trimmedUrl = url.trim();
  const isUrlValid = /^https?:\/\/\S+$/i.test(trimmedUrl);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && !createExternalLink.isPending) {
      setUrl("");
      setTitle("");
      onClose();
    }
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!isUrlValid || createExternalLink.isPending) return;

    createExternalLink.mutate(
      {
        taskId,
        url: trimmedUrl,
        ...(title.trim() ? { title: title.trim() } : {}),
      },
      {
        onSuccess: () => {
          setUrl("");
          setTitle("");
          onClose();
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{t("tasks:branches.pastePrTitle")}</DialogTitle>
            <DialogDescription>
              {t("tasks:branches.pastePrDescription")}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 px-6 py-4">
            <div className="grid gap-2">
              <Label htmlFor="branch-pr-url">
                {t("settings:externalLinks.url")}
              </Label>
              <Input
                id="branch-pr-url"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://github.com/owner/repo/pull/12"
                autoFocus
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="branch-pr-title">
                {t("settings:externalLinks.titleOptional")}
              </Label>
              <Input
                id="branch-pr-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              {t("common:actions.cancel")}
            </Button>
            <Button type="submit" disabled={!isUrlValid}>
              {createExternalLink.isPending
                ? t("tasks:branches.pasting")
                : t("tasks:branches.pastePrButton")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
