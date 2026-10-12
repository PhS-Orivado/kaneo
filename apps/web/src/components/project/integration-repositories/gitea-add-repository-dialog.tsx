import { GitBranch } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AddBindingErrorAlert } from "@/components/project/integration-repositories/add-binding-error-alert";
import {
  parseAddBindingError,
  type AddBindingError,
} from "@/components/project/integration-repositories/add-binding-error";
import { GiteaRepositoryBrowserModal } from "@/components/project/gitea-repository-browser-modal";
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
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { useCreateGiteaIntegration } from "@/hooks/mutations/gitea-integration/use-create-gitea-integration";
import { toast } from "@/lib/toast";

type GiteaAddRepositoryDialogProps = {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * RFC 0001 WP7: the add-more flow once the project already has a Gitea
 * binding. The dialog only collects the instance credentials; the repository
 * is picked in the browser, and the picked repository is created directly.
 * A failed create keeps the browser open and renders the server's own
 * blocker message next to the action (D2), including the plan limit 402.
 */
export function GiteaAddRepositoryDialog({
  projectId,
  open,
  onOpenChange,
}: GiteaAddRepositoryDialogProps) {
  const { t } = useTranslation();
  const { mutateAsync: createIntegration, isPending: isCreating } =
    useCreateGiteaIntegration();
  const [baseUrl, setBaseUrl] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [showBrowser, setShowBrowser] = useState(false);
  const [addError, setAddError] = useState<AddBindingError | null>(null);

  const canBrowse =
    open && baseUrl.trim().length > 0 && accessToken.trim().length > 0;

  const handleSelectRepository = async (repository: {
    owner: string;
    name: string;
  }) => {
    try {
      await createIntegration({
        projectId,
        data: {
          baseUrl: baseUrl.trim(),
          accessToken: accessToken.trim(),
          repositoryOwner: repository.owner,
          repositoryName: repository.name,
        },
      });
      setAddError(null);
      setShowBrowser(false);
      onOpenChange(false);
      setBaseUrl("");
      setAccessToken("");
      toast.success(t("settings:repositoryBindings.toast.added"));
    } catch (error) {
      // The browser stays open so the user can pick another repository.
      setAddError(parseAddBindingError(error));
    }
  };

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) {
            setAddError(null);
          }
          onOpenChange(next);
        }}
      >
        <DialogPopup className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {t("settings:repositoryBindings.addRepositoryTitle")}
            </DialogTitle>
            <DialogDescription>
              {t("settings:repositoryBindings.addRepositoryHint")}
            </DialogDescription>
          </DialogHeader>
          <DialogPanel>
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">
                    {t("settings:giteaIntegration.baseUrlLabel")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("settings:giteaIntegration.baseUrlHint")}
                  </p>
                </div>
                <Input
                  className="w-72"
                  placeholder="https://gitea.example.com"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  disabled={isCreating}
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">
                    {t("settings:giteaIntegration.tokenLabel")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("settings:giteaIntegration.tokenHint")}
                  </p>
                </div>
                <Input
                  className="w-72"
                  type="password"
                  autoComplete="off"
                  placeholder={t("settings:giteaIntegration.tokenPlaceholder")}
                  value={accessToken}
                  onChange={(e) => setAccessToken(e.target.value)}
                  disabled={isCreating}
                />
              </div>

              {addError ? (
                <AddBindingErrorAlert
                  error={addError}
                  onDismiss={() => setAddError(null)}
                />
              ) : null}
            </div>
          </DialogPanel>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>
              {t("common:actions.cancel")}
            </DialogClose>
            <Button
              type="button"
              disabled={!canBrowse || isCreating}
              onClick={() => setShowBrowser(true)}
            >
              <GitBranch aria-hidden="true" className="size-3" />
              {t("settings:repositoryBindings.browseRepositories")}
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>

      <GiteaRepositoryBrowserModal
        projectId={projectId}
        open={showBrowser}
        onOpenChange={(next) => {
          if (!next) {
            setAddError(null);
          }
          setShowBrowser(next);
        }}
        onSelectRepository={(repository) =>
          void handleSelectRepository(repository)
        }
        baseUrl={baseUrl.trim()}
        accessToken={accessToken.trim()}
        addError={addError}
        onDismissError={() => setAddError(null)}
      />
    </>
  );
}
