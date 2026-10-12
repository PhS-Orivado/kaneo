import { GitBranch } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AddBindingErrorAlert } from "@/components/project/integration-repositories/add-binding-error-alert";
import {
  parseAddBindingError,
  type AddBindingError,
} from "@/components/project/integration-repositories/add-binding-error";
import { GitlabProjectBrowserModal } from "@/components/project/gitlab-project-browser-modal";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useCreateGitlabIntegration } from "@/hooks/mutations/gitlab-integration/use-create-gitlab-integration";
import { toast } from "@/lib/toast";

const GITLAB_CLOUD_URL = "https://gitlab.com";

type GitlabAddRepositoryDialogProps = {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * RFC 0001 WP7: the add-more flow once the project already has a GitLab
 * binding. The dialog collects the instance credentials; the project is
 * picked in the browser and created directly. A failed create keeps the
 * browser open and renders the server's own blocker message next to the
 * action (D2), including the plan limit 402.
 */
export function GitlabAddRepositoryDialog({
  projectId,
  open,
  onOpenChange,
}: GitlabAddRepositoryDialogProps) {
  const { t } = useTranslation();
  const { mutateAsync: createIntegration, isPending: isCreating } =
    useCreateGitlabIntegration();
  const [baseUrl, setBaseUrl] = useState(GITLAB_CLOUD_URL);
  const [accessToken, setAccessToken] = useState("");
  const [tokenType, setTokenType] = useState<"private" | "bearer">("private");
  const [showBrowser, setShowBrowser] = useState(false);
  const [addError, setAddError] = useState<AddBindingError | null>(null);

  const canBrowse =
    open && baseUrl.trim().length > 0 && accessToken.trim().length > 0;

  const handleSelectProject = async (projectPath: string) => {
    try {
      await createIntegration({
        projectId,
        data: {
          baseUrl: baseUrl.trim(),
          accessToken: accessToken.trim(),
          tokenType,
          projectPath,
        },
      });
      setAddError(null);
      setShowBrowser(false);
      onOpenChange(false);
      setAccessToken("");
      toast.success(t("settings:repositoryBindings.toast.added"));
    } catch (error) {
      // The browser stays open so the user can pick another project.
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
                    {t("settings:gitlabIntegration.baseUrlLabel")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("settings:gitlabIntegration.baseUrlHint")}
                  </p>
                </div>
                <Input
                  className="w-72"
                  placeholder={GITLAB_CLOUD_URL}
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  disabled={isCreating}
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">
                    {t("settings:gitlabIntegration.tokenLabel")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("settings:gitlabIntegration.tokenHint")}
                  </p>
                </div>
                <Input
                  className="w-72"
                  type="password"
                  autoComplete="off"
                  placeholder={t("settings:gitlabIntegration.tokenPlaceholder")}
                  value={accessToken}
                  onChange={(e) => setAccessToken(e.target.value)}
                  disabled={isCreating}
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">
                    {t("settings:gitlabIntegration.tokenTypeLabel")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("settings:gitlabIntegration.tokenTypeHint")}
                  </p>
                </div>
                <Select
                  value={tokenType}
                  onValueChange={(next) =>
                    setTokenType(next as "private" | "bearer")
                  }
                  disabled={isCreating}
                >
                  <SelectTrigger className="w-72">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="private">
                      {t("settings:gitlabIntegration.tokenTypePrivate")}
                    </SelectItem>
                    <SelectItem value="bearer">
                      {t("settings:gitlabIntegration.tokenTypeBearer")}
                    </SelectItem>
                  </SelectContent>
                </Select>
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

      <GitlabProjectBrowserModal
        projectId={projectId}
        open={showBrowser}
        onOpenChange={(next) => {
          if (!next) {
            setAddError(null);
          }
          setShowBrowser(next);
        }}
        onSelectProject={(projectPath) => void handleSelectProject(projectPath)}
        baseUrl={baseUrl.trim()}
        accessToken={accessToken.trim()}
        tokenType={tokenType}
        addError={addError}
        onDismissError={() => setAddError(null)}
      />
    </>
  );
}
