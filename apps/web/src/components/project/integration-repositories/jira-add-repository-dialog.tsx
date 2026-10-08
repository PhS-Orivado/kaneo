import { SquareKanban } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AddBindingErrorAlert } from "@/components/project/integration-repositories/add-binding-error-alert";
import {
  parseAddBindingError,
  type AddBindingError,
} from "@/components/project/integration-repositories/add-binding-error";
import { JiraProjectBrowserModal } from "@/components/project/jira-project-browser-modal";
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
import { useCreateJiraIntegration } from "@/hooks/mutations/jira-integration/use-create-jira-integration";
import { toast } from "@/lib/toast";

type JiraAuthMode = "cloud" | "dc";

type JiraAddRepositoryDialogProps = {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * RFC 0001 WP7: the add-more flow once the project already has a Jira
 * binding. The dialog only collects the instance credentials; the project
 * is picked in the browser, and the picked project is created directly. A
 * failed create keeps the browser open and renders the server's own blocker
 * message next to the action (D2), including the plan limit 402.
 */
export function JiraAddRepositoryDialog({
  projectId,
  open,
  onOpenChange,
}: JiraAddRepositoryDialogProps) {
  const { t } = useTranslation();
  const { mutateAsync: createIntegration, isPending: isCreating } =
    useCreateJiraIntegration();
  const [baseUrl, setBaseUrl] = useState("");
  const [authMode, setAuthMode] = useState<JiraAuthMode>("cloud");
  const [email, setEmail] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [showBrowser, setShowBrowser] = useState(false);
  const [addError, setAddError] = useState<AddBindingError | null>(null);

  const canBrowse =
    open &&
    baseUrl.trim().length > 0 &&
    apiToken.trim().length > 0 &&
    (authMode !== "cloud" || email.trim().length > 0);

  const handleSelectProject = async (project: {
    key: string;
    name: string;
  }) => {
    try {
      await createIntegration({
        projectId,
        data: {
          baseUrl: baseUrl.trim(),
          authMode,
          email: authMode === "cloud" ? email.trim() : undefined,
          apiToken: apiToken.trim(),
          projectKey: project.key,
        },
      });
      setAddError(null);
      setShowBrowser(false);
      onOpenChange(false);
      setBaseUrl("");
      setEmail("");
      setApiToken("");
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
                    {t("settings:jiraIntegration.baseUrlLabel")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("settings:jiraIntegration.baseUrlHint")}
                  </p>
                </div>
                <Input
                  className="w-72"
                  placeholder="https://your-company.atlassian.net"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  disabled={isCreating}
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">
                    {t("settings:jiraIntegration.authModeLabel")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("settings:jiraIntegration.authModeHint")}
                  </p>
                </div>
                <Select
                  value={authMode}
                  onValueChange={(value) => setAuthMode(value as JiraAuthMode)}
                  disabled={isCreating}
                >
                  <SelectTrigger className="w-72">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cloud">
                      {t("settings:jiraIntegration.authModeCloud")}
                    </SelectItem>
                    <SelectItem value="dc">
                      {t("settings:jiraIntegration.authModeDc")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {authMode === "cloud" ? (
                <>
                  <Separator />
                  <div className="flex items-center justify-between gap-4">
                    <div className="space-y-0.5">
                      <p className="text-sm font-medium">
                        {t("settings:jiraIntegration.emailLabel")}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t("settings:jiraIntegration.emailHint")}
                      </p>
                    </div>
                    <Input
                      className="w-72"
                      type="email"
                      autoComplete="off"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={isCreating}
                    />
                  </div>
                </>
              ) : null}

              <Separator />

              <div className="flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">
                    {t(
                      authMode === "cloud"
                        ? "settings:jiraIntegration.tokenLabel"
                        : "settings:jiraIntegration.patLabel",
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t(
                      authMode === "cloud"
                        ? "settings:jiraIntegration.tokenHint"
                        : "settings:jiraIntegration.patHint",
                    )}
                  </p>
                </div>
                <Input
                  className="w-72"
                  type="password"
                  autoComplete="off"
                  placeholder={t("settings:jiraIntegration.tokenPlaceholder")}
                  value={apiToken}
                  onChange={(e) => setApiToken(e.target.value)}
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
              <SquareKanban aria-hidden="true" className="size-3" />
              {t("settings:jiraIntegration.browseProjects")}
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>

      <JiraProjectBrowserModal
        projectId={projectId}
        open={showBrowser}
        onOpenChange={(next) => {
          if (!next) {
            setAddError(null);
          }
          setShowBrowser(next);
        }}
        onSelectProject={(project) => void handleSelectProject(project)}
        baseUrl={baseUrl.trim()}
        authMode={authMode}
        email={email.trim()}
        apiToken={apiToken.trim()}
        addError={addError}
        onDismissError={() => setAddError(null)}
      />
    </>
  );
}
