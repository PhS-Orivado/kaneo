import { useState } from "react";
import { useTranslation } from "react-i18next";
import { GithubIcon } from "@/components/icons/github-icon";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import useCreateRepositoryBranch from "@/hooks/mutations/github-integration/use-create-repository-branch";
import { toast } from "@/lib/toast";
import type { ProjectRepositoryBinding } from "@/types/repository-binding";
import {
  BRANCH_TYPES,
  buildTypedBranchName,
  defaultBranchType,
  type BranchType,
} from "./branch-type";

type CreateBranchDialogProps = {
  open: boolean;
  onClose: () => void;
  taskId: string;
  ticket: string;
  githubBindings: ProjectRepositoryBinding[];
  labelNames: string[];
};

/**
 * Create a branch named after the task's kind and ticket, e.g. fix/EC-123,
 * from the default branch head of every selected linked repository.
 */
export function CreateBranchDialog({
  open,
  onClose,
  taskId,
  ticket,
  githubBindings,
  labelNames,
}: CreateBranchDialogProps) {
  const { t } = useTranslation();
  const [type, setType] = useState<BranchType>(
    defaultBranchType(labelNames),
  );
  const [selectedRepos, setSelectedRepos] = useState<string[]>(
    githubBindings.map((binding) => binding.id),
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const createRepositoryBranch = useCreateRepositoryBranch();

  const branchName = buildTypedBranchName(type, ticket);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && !isSubmitting) onClose();
  };

  const toggleRepo = (integrationId: string) => {
    setSelectedRepos((previous) =>
      previous.includes(integrationId)
        ? previous.filter((id) => id !== integrationId)
        : [...previous, integrationId],
    );
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!ticket || selectedRepos.length === 0 || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const results = await Promise.allSettled(
        selectedRepos.map((integrationId) =>
          createRepositoryBranch.mutateAsync({
            integrationId,
            taskId,
            branchName,
            create: true,
          }),
        ),
      );

      const failed = results.filter(
        (result) => result.status === "rejected",
      ).length;
      const succeeded = results.length - failed;

      if (succeeded > 0) {
        toast.success(
          t("tasks:branches.createdIn", { count: succeeded, branch: branchName }),
        );
      }
      for (const result of results) {
        if (result.status === "rejected") {
          toast.error(t("tasks:branches.createRepoError", { branch: branchName }));
          break;
        }
      }

      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{t("tasks:branches.createTitle")}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 px-6 py-4">
            <div className="grid gap-2">
              <Label htmlFor="branch-type">
                {t("tasks:branches.typeLabel")}
              </Label>
              <Select
                value={type}
                onValueChange={(value) => setType(value as BranchType)}
              >
                <SelectTrigger id="branch-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BRANCH_TYPES.map((branchType) => (
                    <SelectItem key={branchType} value={branchType}>
                      {t(`tasks:branchTypes.${branchType}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="branch-name">
                {t("tasks:branches.nameLabel")}
              </Label>
              <Input
                id="branch-name"
                value={branchName}
                readOnly
                className="font-mono"
                placeholder={t("tasks:branches.namePlaceholder")}
              />
              <p className="text-xs text-muted-foreground">
                {t("tasks:branches.nameHint")}
              </p>
            </div>

            <div className="grid gap-2">
              <Label>{t("tasks:branches.repositories")}</Label>
              <div className="space-y-1">
                {githubBindings.map((binding) => (
                  <label
                    key={binding.id}
                    className="flex h-9 w-full cursor-pointer items-center gap-2 rounded-md px-2 text-sm transition-colors hover:bg-accent/50"
                  >
                    <Checkbox
                      checked={selectedRepos.includes(binding.id)}
                      onCheckedChange={() => toggleRepo(binding.id)}
                    />
                    <GithubIcon className="size-3.5 shrink-0" />
                    <span className="min-w-0 flex-1 truncate">
                      {binding.identity}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t("common:actions.cancel")}
            </Button>
            <Button
              type="submit"
              disabled={
                !ticket || selectedRepos.length === 0 || isSubmitting
              }
            >
              {isSubmitting
                ? t("tasks:branches.creating")
                : t("tasks:branches.createButton")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
