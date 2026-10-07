import { useQuery } from "@tanstack/react-query";
import { ExternalLink, GitBranch, Link2, Lock, Search } from "lucide-react";
import React from "react";
import { useTranslation } from "react-i18next";
import { AddBindingErrorAlert } from "@/components/project/integration-repositories/add-binding-error-alert";
import type { AddBindingError } from "@/components/project/integration-repositories/add-binding-error";
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
import listGitlabProjects, {
  type ListGitlabProjectsResponse,
} from "@/fetchers/gitlab-integration/list-gitlab-projects";
import { cn } from "@/lib/cn";
import { tokenFingerprint } from "@/lib/token-fingerprint";

type GitlabProjectBrowserModalProps = {
  open: boolean;
  projectId: string;
  onOpenChange: (open: boolean) => void;
  onSelectProject: (projectPath: string) => void;
  selectedProjectPath?: string;
  baseUrl: string;
  accessToken: string;
  tokenType: "private" | "bearer";
  /**
   * RFC 0001 WP7 D2: an add-flow failure rendered inline. The modal stays
   * open; the blocker and the action that resolves it are shown together.
   */
  addError?: AddBindingError | null;
  onDismissError?: () => void;
};

export function GitlabProjectBrowserModal({
  open,
  projectId,
  onOpenChange,
  onSelectProject,
  selectedProjectPath,
  baseUrl,
  accessToken,
  tokenType,
  addError,
  onDismissError,
}: GitlabProjectBrowserModalProps) {
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = React.useState("");

  const canFetch =
    open && baseUrl.trim().length > 0 && accessToken.trim().length > 0;

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: [
      "gitlab-projects",
      projectId,
      baseUrl,
      tokenType,
      tokenFingerprint(accessToken),
    ],
    queryFn: () =>
      listGitlabProjects({ projectId, baseUrl, accessToken, tokenType }),
    enabled: canFetch,
    gcTime: 0,
  });

  const filteredProjects = React.useMemo(() => {
    if (!data?.projects) return [];

    if (!searchTerm) return data.projects;

    const search = searchTerm.toLowerCase();
    return data.projects.filter((project) =>
      project.path_with_namespace.toLowerCase().includes(search),
    );
  }, [data?.projects, searchTerm]);

  const handleSelectProject = (
    project: ListGitlabProjectsResponse["projects"][number],
  ) => {
    onSelectProject(project.path_with_namespace);
    resetAndCloseModal(false);
  };

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
            <GitBranch className="size-5" />
            {t("settings:gitlabIntegration.browseModalTitle")}
          </DialogTitle>
          <DialogDescription>
            {t("settings:gitlabIntegration.browseModalHint")}
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 pb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder={t("settings:gitlabIntegration.searchProjects")}
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
              {t("settings:gitlabIntegration.browseNeedsCredentials")}
            </p>
          )}
          {canFetch && isLoading && (
            <p className="text-sm text-muted-foreground py-8 text-center">
              {t("settings:gitlabIntegration.loadingProjects")}
            </p>
          )}
          {canFetch && error && (
            <div className="py-6 text-center space-y-2">
              <p className="text-sm text-destructive">
                {error instanceof Error
                  ? error.message
                  : t("settings:gitlabIntegration.loadProjectsError")}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => refetch()}
              >
                {t("settings:gitlabIntegration.retry")}
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
                      // RFC 0001 D1: a project already linked to this very
                      // project cannot be selected again; cross-project
                      // links stay selectable and are informational only.
                      disabled={project.linkedTo?.projectId === projectId}
                      aria-disabled={project.linkedTo?.projectId === projectId}
                      onClick={() => handleSelectProject(project)}
                      className={cn(
                        "flex-1 flex items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm hover:bg-muted/80 transition-colors",
                        "disabled:cursor-not-allowed disabled:opacity-60",
                        selectedProjectPath === project.path_with_namespace &&
                          "bg-muted",
                      )}
                    >
                      <span className="font-medium truncate">
                        {project.path_with_namespace}
                      </span>
                      <div className="flex items-center gap-2 shrink-0">
                        {project.visibility !== "public" ? (
                          <Lock className="size-3.5 text-muted-foreground" />
                        ) : null}
                        {project.linkedTo ? (
                          project.linkedTo.projectId === projectId ? (
                            <Badge variant="outline" className="text-xs gap-1">
                              <Link2 className="size-3" />
                              {t(
                                "settings:repositoryBindings.linkedInProject",
                              )}
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-xs gap-1">
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
                        ) : (
                          <Badge variant="secondary" className="text-xs">
                            {project.visibility}
                          </Badge>
                        )}
                      </div>
                    </button>
                    <a
                      href={project.web_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={t("settings:gitlabIntegration.openInGitlab", {
                        project: project.path_with_namespace,
                      })}
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
