import { GitBranch, GitPullRequest, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import useListProjectRepositoryBindings from "@/hooks/queries/repository-bindings/use-list-project-repository-bindings";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import type { ExternalLink } from "@/types/external-link";
import { ticketId } from "./branch-type";
import { BranchRow } from "./branch-row";
import { CreateBranchDialog } from "./create-branch-dialog";
import { LinkBranchDialog, branchKey } from "./link-branch-dialog";
import { PastePrLinkDialog } from "./paste-pr-link-dialog";

type TaskBranchesProps = {
  taskId: string;
  taskNumber: number | null | undefined;
  projectSlug: string | null | undefined;
  labelNames: string[];
  externalLinks: ExternalLink[];
  projectId: string;
};

type BranchDialog = "create" | "find" | "pr" | null;

/**
 * Task branch section: linked repositories can share branches with the same
 * task-derived name (fix/EC-123). Branches reach the task three ways: a
 * button creating them from the ticket key, a search over the repositories'
 * existing branch names, or a pasted pull request URL.
 */
export function TaskBranches({
  taskId,
  taskNumber,
  projectSlug,
  labelNames,
  externalLinks,
  projectId,
}: TaskBranchesProps) {
  const { t } = useTranslation();
  const { canUpdateTasks } = useWorkspacePermission();
  const canManageBranches = canUpdateTasks();
  const [dialog, setDialog] = useState<BranchDialog>(null);

  const { data: bindingsData, isLoading } =
    useListProjectRepositoryBindings(projectId);

  const bindings = useMemo(
    () => (bindingsData?.bindings ?? []).filter((binding) => binding.isActive),
    [bindingsData],
  );

  const githubBindings = useMemo(
    () => bindings.filter((binding) => binding.type === "github"),
    [bindings],
  );

  const branchLinks = useMemo(
    () => externalLinks.filter((link) => link.resourceType === "branch"),
    [externalLinks],
  );

  const repoIdentityByIntegrationId = useMemo(() => {
    const map = new Map<string, string>();
    for (const binding of bindings) map.set(binding.id, binding.identity);
    return map;
  }, [bindings]);

  const linkedBranchKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const link of branchLinks) {
      if (link.integrationId)
        keys.add(branchKey(link.integrationId, link.externalId));
    }
    return keys;
  }, [branchLinks]);

  // Nothing to show without linked repositories: keep task pages lean.
  if (!isLoading && bindings.length === 0) return null;

  const ticket = ticketId(projectSlug, taskNumber);

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          {t("tasks:branches.title")}
        </span>
        {canManageBranches && bindings.length > 0 && (
          <div className="flex items-center gap-1">
            {githubBindings.length > 0 && (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1"
                  disabled={!ticket}
                  onClick={() => setDialog("create")}
                >
                  <Plus className="size-4" />
                  {t("tasks:branches.create")}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1"
                  onClick={() => setDialog("find")}
                >
                  <Search className="size-4" />
                  {t("tasks:branches.find")}
                </Button>
              </>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 gap-1"
              onClick={() => setDialog("pr")}
            >
              <GitPullRequest className="size-4" />
              {t("tasks:branches.pastePr")}
            </Button>
          </div>
        )}
      </div>

      {branchLinks.length > 0 ? (
        <div className="mt-2 flex flex-col gap-2">
          {branchLinks.map((link) => (
            <BranchRow
              key={link.id}
              taskId={taskId}
              link={link}
              repoIdentity={
                link.integrationId
                  ? repoIdentityByIntegrationId.get(link.integrationId)
                  : undefined
              }
            />
          ))}
        </div>
      ) : (
        <p className="mt-2 flex items-center gap-2 px-1 text-sm text-muted-foreground">
          <GitBranch className="size-4" />
          {t("tasks:branches.empty")}
        </p>
      )}

      {canManageBranches && bindings.length > 0 && (
        <>
          {githubBindings.length > 0 && (
            <>
              <CreateBranchDialog
                open={dialog === "create"}
                onClose={() => setDialog(null)}
                taskId={taskId}
                ticket={ticket}
                githubBindings={githubBindings}
                labelNames={labelNames}
              />
              <LinkBranchDialog
                open={dialog === "find"}
                onClose={() => setDialog(null)}
                taskId={taskId}
                githubBindings={githubBindings}
                defaultQuery={ticket}
                linkedBranchKeys={linkedBranchKeys}
              />
            </>
          )}
          <PastePrLinkDialog
            open={dialog === "pr"}
            onClose={() => setDialog(null)}
            taskId={taskId}
          />
        </>
      )}
    </div>
  );
}
