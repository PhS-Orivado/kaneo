import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Link2, Search } from "lucide-react";
import React from "react";
import { useTranslation } from "react-i18next";
import { AddBindingErrorAlert } from "@/components/project/integration-repositories/add-binding-error-alert";
import type { AddBindingError } from "@/components/project/integration-repositories/add-binding-error";
import { JiraIcon } from "@/components/icons/jira-icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import listJiraProjects from "@/fetchers/jira-integration/list-jira-projects";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/cn";

type JiraProjectBrowserModalProps = {
  open: boolean;
  projectId: string;
  onOpenChange: (open: boolean) => void;
  onSelectProject: (project: { key: string; name: string }) => void;
  selectedProject?: string;
  baseUrl: string;
  authMode: "cloud" | "dc";
  email: string;
  apiToken: string;
  /**
   * RFC 0001 WP7 D2: an add-flow failure rendered inline. The modal stays
   * open; the blocker and the action that resolves it are shown together.
   */
  addError?: AddBindingError | null;
  onDismissError?: () => void;
};

export function JiraProjectBrowserModal({
  open,
  projectId,
  onOpenChange,
  onSelectProject,
  selectedProject,
  baseUrl,
  authMode,
  email,
  apiToken,
  addError,
  onDismissError,
}: JiraProjectBrowserModalProps) {
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = React.useState("");
  const { data: session } = authClient.useSession();
  // A credential change needs a fresh cache namespace without putting the
  // secret itself into serializable query keys, logs or query devtools.
  const credentials = React.useMemo(
    () => ({ apiToken, cacheId: crypto.randomUUID() }),
    [apiToken],
  );

  const canFetch =
    open &&
    Boolean(session?.user.id) &&
    baseUrl.trim().length > 0 &&
    apiToken.trim().length > 0 &&
    (authMode !== "cloud" || email.trim().length > 0);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: [
      "jira-projects",
      session?.user.id,
      projectId,
      baseUrl,
      credentials.cacheId,
    ],
    queryFn: () =>
      listJiraProjects({
        projectId,
        baseUrl,
        authMode,
        email: authMode === "cloud" ? email : undefined,
        apiToken: credentials.apiToken,
      }),
    enabled: canFetch,
    gcTime: 0,
    placeholderData: () => undefined,
  });

  const filteredProjects = React.useMemo(() => {
    if (!data?.projects) return [];

    if (!searchTerm) return data.projects;

    const search = searchTerm.toLowerCase();
    return data.projects.filter(
      (project) =>
        project.key.toLowerCase().includes(search) ||
        project.name.toLowerCase().includes(search),
    );
  }, [data?.projects, searchTerm]);

  const resetAndCloseModal = (next: boolean) => {
    if (!next) {
      setSearchTerm("");
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={resetAndCloseModal}>
      <DialogContent className="!max-w-2xl max-h-[85vh] p-0 gap-0 flex flex-col">
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle className="flex items-center gap-2">
            <JiraIcon className="size-5" />
            {t("settings:jiraIntegration.browseModalTitle")}
          </DialogTitle>
          <DialogDescription>
            {t("settings:jiraIntegration.browseModalHint")}
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 pb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder={t("settings:jiraIntegration.searchProjects")}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto border-t border-border px-6 py-2">
          {addError && onDismissError ? (
            <div className="py-2">
              <AddBindingErrorAlert
                error={addError}
                onDismiss={onDismissError}
              />
            </div>
          ) : null}
          {!canFetch && (
            <p className="text-sm text-muted-foreground py-8 text-center">
              {t("settings:jiraIntegration.browseNeedsCredentials")}
            </p>
          )}
          {canFetch && isLoading && (
            <p className="text-sm text-muted-foreground py-8 text-center">
              {t("settings:jiraIntegration.loadingProjects")}
            </p>
          )}
          {canFetch && error && (
            <div className="py-6 text-center space-y-2">
              <p className="text-sm text-destructive">
                {error instanceof Error ? error.message : "Error"}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => refetch()}
              >
                {t("settings:jiraIntegration.retry")}
              </Button>
            </div>
          )}
          {canFetch && data && (
            <ul className="space-y-1">
              {filteredProjects.map((project) => (
                <li key={project.id}>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      // RFC 0001 D1: a project already linked to this
                      // project cannot be selected again; cross-project
                      // links stay selectable and are informational only.
                      disabled={project.linkedTo?.projectId === projectId}
                      aria-disabled={project.linkedTo?.projectId === projectId}
                      onClick={() => {
                        onSelectProject({
                          key: project.key,
                          name: project.name,
                        });
                        resetAndCloseModal(false);
                      }}
                      className={cn(
                        "flex-1 flex items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm hover:bg-muted/80 transition-colors",
                        "disabled:cursor-not-allowed disabled:opacity-60",
                        selectedProject === project.key && "bg-muted",
                      )}
                    >
                      <span className="min-w-0 truncate">
                        <span className="font-medium">{project.key}</span>
                        <span className="text-muted-foreground ml-2">
                          {project.name}
                        </span>
                      </span>
                      <div className="flex items-center gap-2 shrink-0">
                        {project.linkedTo ? (
                          project.linkedTo.projectId === projectId ? (
                            <Badge variant="outline" className="text-xs gap-1">
                              <Link2 className="size-3" />
                              {t("settings:repositoryBindings.linkedInProject")}
                            </Badge>
                          ) : (
                            <Badge
                              variant="secondary"
                              className="text-xs gap-1"
                            >
                              <Link2 className="size-3" />
                              {t(
                                "settings:repositoryBindings.linkedInOtherProject",
                                {
                                  project:
                                    project.linkedTo.projectName ??
                                    t(
                                      "settings:repositoryBindings.linkedInUnknownProject",
                                    ),
                                },
                              )}
                            </Badge>
                          )
                        ) : null}
                      </div>
                    </button>
                    <a
                      href={`${baseUrl.replace(/\/+$/, "")}/browse/${project.key}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-md p-2 text-primary hover:bg-muted/80 transition-colors"
                    >
                      <ExternalLink className="size-3.5" />
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
