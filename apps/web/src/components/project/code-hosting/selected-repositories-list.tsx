import { XIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

type SelectedRepositoriesListProps = {
  repositories: string[];
  disabled?: boolean;
  onRemove: (repository: string) => void;
};

export function SelectedRepositoriesList({
  repositories,
  disabled = false,
  onRemove,
}: SelectedRepositoriesListProps) {
  const { t } = useTranslation();
  if (repositories.length === 0) return null;

  return (
    <ul
      className="space-y-1"
      aria-label={t("settings:codeHosting.selectedRepositories")}
    >
      {repositories.map((repository) => (
        <li
          key={repository}
          className="flex items-center gap-2 rounded-lg bg-accent/40 px-2.5 py-1.5"
        >
          <span className="min-w-0 flex-1 truncate font-mono text-[13px]">
            {repository}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={disabled}
            aria-label={`${t("common:actions.remove")}: ${repository}`}
            onClick={() => onRemove(repository)}
          >
            <XIcon aria-hidden="true" className="size-3.5" />
          </Button>
        </li>
      ))}
    </ul>
  );
}
