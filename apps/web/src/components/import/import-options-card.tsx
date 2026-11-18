import { Link } from "@tanstack/react-router";
import { Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ImportSourceId } from "@/components/import/import-source-definitions";
import { Button } from "@/components/ui/button";
import { Radio, RadioGroup } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";

export type ImportUserHandling = "invite" | "create";

type ImportOptionsCardProps = {
  sourceId: ImportSourceId;
  workspaceId: string;
  workspaceName: string;
  includeComments: boolean;
  onIncludeCommentsChange: (includeComments: boolean) => void;
  includeSprints: boolean;
  onIncludeSprintsChange: (includeSprints: boolean) => void;
  userHandling: ImportUserHandling;
  onUserHandlingChange: (userHandling: ImportUserHandling) => void;
};

const USER_HANDLING_OPTIONS: {
  value: ImportUserHandling;
  labelKey: string;
  descriptionKey: string;
}[] = [
  {
    value: "invite",
    labelKey: "settings:workspaceImport.select.usersInviteLabel",
    descriptionKey: "settings:workspaceImport.select.usersInviteDescription",
  },
  {
    value: "create",
    labelKey: "settings:workspaceImport.select.usersCreateLabel",
    descriptionKey: "settings:workspaceImport.select.usersCreateDescription",
  },
];

export function ImportOptionsCard({
  sourceId,
  workspaceId,
  workspaceName,
  includeComments,
  onIncludeCommentsChange,
  includeSprints,
  onIncludeSprintsChange,
  userHandling,
  onUserHandlingChange,
}: ImportOptionsCardProps) {
  const { t } = useTranslation();

  return (
    <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
      {sourceId === "jira" ? (
        <div className="flex items-center justify-between gap-4 px-4 py-3.5">
          <div className="min-w-0 space-y-0.5">
            <p id="import-sprints-label" className="font-medium text-sm">
              {t("settings:workspaceImport.select.sprintsLabel")}
            </p>
            <p
              id="import-sprints-description"
              className="text-muted-foreground text-xs"
            >
              {t("settings:workspaceImport.select.sprintsDescription")}
            </p>
          </div>
          <Switch
            checked={includeSprints}
            onCheckedChange={onIncludeSprintsChange}
            aria-labelledby="import-sprints-label"
            aria-describedby="import-sprints-description"
          />
        </div>
      ) : null}
      <div className="flex items-center justify-between gap-4 px-4 py-3.5">
        <div className="min-w-0 space-y-0.5">
          <p id="import-comments-label" className="font-medium text-sm">
            {t("settings:workspaceImport.select.commentsLabel")}
          </p>
          <p
            id="import-comments-description"
            className="text-muted-foreground text-xs"
          >
            {t("settings:workspaceImport.select.commentsDescription")}
          </p>
        </div>
        <Switch
          checked={includeComments}
          onCheckedChange={onIncludeCommentsChange}
          aria-labelledby="import-comments-label"
          aria-describedby="import-comments-description"
        />
      </div>
      <fieldset className="space-y-2.5 px-4 py-3.5">
        <div className="space-y-0.5">
          <p id="import-users-label" className="font-medium text-sm">
            {t("settings:workspaceImport.select.usersLabel")}
          </p>
          <p
            id="import-users-description"
            className="text-muted-foreground text-xs"
          >
            {t("settings:workspaceImport.select.usersDescription")}
          </p>
        </div>
        <RadioGroup
          value={userHandling}
          onValueChange={(value) =>
            onUserHandlingChange(value as ImportUserHandling)
          }
          aria-labelledby="import-users-label"
          className="gap-2"
        >
          {USER_HANDLING_OPTIONS.map((option) => (
            <label
              key={option.value}
              className={
                option.value === userHandling
                  ? "flex cursor-pointer items-start gap-2.5 rounded-lg border border-primary/50 bg-primary/5 px-3 py-2 transition-colors"
                  : "flex cursor-pointer items-start gap-2.5 rounded-lg border border-border/70 px-3 py-2 transition-colors hover:bg-accent/40"
              }
            >
              <Radio
                value={option.value}
                className="mt-0.5"
                aria-labelledby={`import-users-${option.value}-label`}
              />
              <span className="min-w-0 space-y-0.5">
                <span
                  id={`import-users-${option.value}-label`}
                  className="block text-sm font-medium"
                >
                  {t(option.labelKey)}
                </span>
                <span className="block text-muted-foreground text-xs">
                  {t(option.descriptionKey)}
                </span>
              </span>
            </label>
          ))}
        </RadioGroup>
      </fieldset>
      <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <Users
            aria-hidden="true"
            className="mt-px size-4 shrink-0 text-muted-foreground"
          />
          <p className="text-muted-foreground text-xs">
            {sourceId === "trello"
              ? t("settings:workspaceImport.select.membersNoteTrello", {
                  workspace: workspaceName,
                })
              : sourceId === "jira"
                ? t("settings:workspaceImport.select.membersNoteJira", {
                    workspace: workspaceName,
                  })
                : t("settings:workspaceImport.select.membersNote", {
                    workspace: workspaceName,
                  })}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="self-start sm:self-auto"
          render={
            <Link
              to="/dashboard/workspace/$workspaceId/members"
              params={{ workspaceId }}
              target="_blank"
              rel="noopener noreferrer"
            />
          }
        >
          {t("settings:workspaceImport.select.inviteMembers")}
          <span className="sr-only">
            {t("settings:workspaceImport.opensInNewTab")}
          </span>
        </Button>
      </div>
    </div>
  );
}
