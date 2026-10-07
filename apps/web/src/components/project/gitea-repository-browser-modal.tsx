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
import listGiteaRepositories, {
  type ListGiteaRepositoriesResponse,
} from "@/fetchers/gitea-integration/list-gitea-repositories";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/cn";

type GiteaRepositoryBrowserModalProps = {
  open: boolean;
  projectId: string;
  onOpenChange: (open: boolean) => void;
  onSelectRepository: (repository: { owner: string; name: string }) => void;
  selectedRepository?: string;
  baseUrl: string;
  accessToken: string;
  /**
   * RFC 0001 WP7 D2: an add-flow failure rendered inline. The modal stays
   * open; the blocker and the action that resolves it are shown together.
   */
  addError?: AddBindingError | null;
  onDismissError?: () => void;
};

export function GiteaRepositoryBrowserModal({
  open,
  projectId,
  onOpenChange,
  onSelectRepository,
  selectedRepository,
  baseUrl,
  accessToken,
  addError,
  onDismissError,
}: GiteaRepositoryBrowserModalProps) {
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = React.useState("");
  const { data: session } = authClient.useSession();
  // A credential change needs a fresh cache namespace without putting the
  // secret itself into serializable query keys, logs or query devtools.
  const credentials = React.useMemo(
    () => ({ accessToken, cacheId: crypto.randomUUID() }),
    [accessToken],
  );

  const canFetch =
    open &&
    Boolean(session?.user.id) &&
    baseUrl.trim().length > 0 &&
    accessToken.trim().length > 0;

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: [
      "gitea-repositories",
      session?.user.id,
      projectId,
      baseUrl,
      credentials.cacheId,
    ],
    queryFn: () =>
      listGiteaRepositories({
        projectId,
        baseUrl,
        accessToken: credentials.accessToken,
      }),
    enabled: canFetch,
    gcTime: 0,
    placeholderData: () => undefined,
  });

  const filteredRepositories = React.useMemo(() => {
    if (!data?.repositories) return [];

    if (!searchTerm) return data.repositories;

    const search = searchTerm.toLowerCase();
    return data.repositories.filter((repo) =>
      repo.full_name.toLowerCase().includes(search),
    );
  }, [data?.repositories, searchTerm]);

  const handleSelectRepository = (
    repository: ListGiteaRepositoriesResponse["repositories"][number],
  ) => {
    onSelectRepository({
      owner: repository.owner.login,
      name: repository.name,
    });
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
            {t("settings:giteaIntegration.browseModalTitle")}
          </DialogTitle>
          <DialogDescription>
            {t("settings:giteaIntegration.browseModalHint")}
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 pb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder={t("settings:giteaIntegration.searchRepos")}
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
              {t("settings:giteaIntegration.browseNeedsCredentials")}
            </p>
          )}
          {canFetch && isLoading && (
            <p className="text-sm text-muted-foreground py-8 text-center">
              {t("settings:giteaIntegration.loadingRepos")}
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
                {t("settings:giteaIntegration.retry")}
              </Button>
            </div>
          )}
          {canFetch && data && (
            <ul className="space-y-1">
              {filteredRepositories.map((repo) => (
                <li key={repo.id}>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      // RFC 0001 D1: a repository already linked to this
                      // project cannot be selected again; cross-project
                      // links stay selectable and are informational only.
                      disabled={repo.linkedTo?.projectId === projectId}
                      aria-disabled={repo.linkedTo?.projectId === projectId}
                      onClick={() => handleSelectRepository(repo)}
                      className={cn(
                        "flex-1 flex items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm hover:bg-muted/80 transition-colors",
                        "disabled:cursor-not-allowed disabled:opacity-60",
                        selectedRepository === repo.full_name && "bg-muted",
                      )}
                    >
                      <span className="font-medium truncate">
                        {repo.full_name}
                      </span>
                      <div className="flex items-center gap-2 shrink-0">
                        {repo.private ? (
                          <Lock className="size-3.5 text-muted-foreground" />
                        ) : null}
                        {repo.linkedTo ? (
                          repo.linkedTo.projectId === projectId ? (
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
                                    repo.linkedTo.projectName ??
                                    t(
                                      "settings:repositoryBindings.linkedInUnknownProject",
                                    ),
                                },
                              )}
                            </Badge>
                          )
                        ) : (
                          <Badge variant="secondary" className="text-xs">
                            {repo.owner.login}
                          </Badge>
                        )}
                      </div>
                    </button>
                    <a
                      href={repo.html_url}
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
