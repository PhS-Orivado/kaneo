import { useTranslation } from "react-i18next";
import { PROVIDER_METADATA } from "@/components/project/integration-repositories/provider-metadata";
import { WorkflowRulesPanel } from "@/components/project/workflow-rules-panel";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import useListGiteaIntegrations from "@/hooks/queries/gitea-integration/use-list-gitea-integrations";
import useListGithubIntegrations from "@/hooks/queries/github-integration/use-list-github-integrations";
import useListGitlabIntegrations from "@/hooks/queries/gitlab-integration/use-list-gitlab-integrations";
import useListJiraIntegrations from "@/hooks/queries/jira-integration/use-list-jira-integrations";
import {
  toGiteaBindingRow,
  toGithubBindingRow,
  toGitlabBindingRow,
  toJiraBindingRow,
  type RepositoryBindingRow,
} from "@/types/repository-binding";
import { useMemo, useState } from "react";

const TYPE_WIDE = "__every_repository__";

type WorkflowEditorProps = {
  projectId: string;
};

// RFC 0001 WP6/WP7: workflow rules are written for the project (type-wide,
// the default) or for one repository binding chosen from the linked
// repositories. A repository-specific rule and a type-wide rule coexist;
// resolution prefers the repository-specific one.
export default function WorkflowEditor({ projectId }: WorkflowEditorProps) {
  const { t } = useTranslation();
  const [selectedIntegrationId, setSelectedIntegrationId] = useState(TYPE_WIDE);

  const { data: github } = useListGithubIntegrations(projectId);
  const { data: gitea } = useListGiteaIntegrations(projectId);
  const { data: gitlab } = useListGitlabIntegrations(projectId);
  const { data: jira } = useListJiraIntegrations(projectId);

  const bindings = useMemo<RepositoryBindingRow[]>(
    () => [
      ...(github?.integrations ?? []).map(toGithubBindingRow),
      ...(gitea?.integrations ?? []).map(toGiteaBindingRow),
      ...(gitlab?.integrations ?? []).map(toGitlabBindingRow),
      ...(jira?.integrations ?? []).map(toJiraBindingRow),
    ],
    [github, gitea, gitlab, jira],
  );

  const selectedBinding = bindings.find(
    (binding) => binding.integrationId === selectedIntegrationId,
  );

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Select
          value={selectedIntegrationId}
          onValueChange={setSelectedIntegrationId}
        >
          <SelectTrigger className="w-64 h-8 text-sm">
            <SelectValue
              aria-label={t("settings:workflowEditor.scopeLabel")}
              placeholder={t("settings:workflowEditor.scopeTypeWide")}
            >
              {selectedBinding
                ? `${t(
                    `settings:${PROVIDER_METADATA[selectedBinding.provider].namespace}.providerName`,
                  )} · ${selectedBinding.identity}`
                : t("settings:workflowEditor.scopeTypeWide")}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TYPE_WIDE}>
              {t("settings:workflowEditor.scopeTypeWide")}
            </SelectItem>
            {bindings.map((binding) => (
              <SelectItem
                key={binding.integrationId}
                value={binding.integrationId}
              >
                {t(
                  `settings:${PROVIDER_METADATA[binding.provider].namespace}.providerName`,
                )}{" "}
                · {binding.identity}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selectedBinding ? (
          <p className="text-xs text-muted-foreground">
            {t("settings:workflowEditor.bindingScopeHint", {
              repository: selectedBinding.identity,
            })}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            {t("settings:workflowEditor.typeWideScopeHint")}
          </p>
        )}
      </div>

      {selectedBinding ? (
        <WorkflowRulesPanel
          key={selectedBinding.integrationId}
          projectId={projectId}
          integrationType={selectedBinding.provider}
          integrationId={selectedBinding.integrationId}
        />
      ) : (
        <div className="space-y-10">
          <ProviderSection
            projectId={projectId}
            integrationType="github"
            headingKey="githubHeading"
            hintKey="githubHint"
          />
          <ProviderSection
            projectId={projectId}
            integrationType="gitea"
            headingKey="giteaHeading"
            hintKey="giteaHint"
          />
          <ProviderSection
            projectId={projectId}
            integrationType="gitlab"
            headingKey="gitlabHeading"
            hintKey="gitlabHint"
          />
          <ProviderSection
            projectId={projectId}
            integrationType="jira"
            headingKey="jiraHeading"
            hintKey="jiraHint"
          />
        </div>
      )}
    </div>
  );
}

function ProviderSection({
  projectId,
  integrationType,
  headingKey,
  hintKey,
}: {
  projectId: string;
  integrationType: "github" | "gitea" | "gitlab" | "jira";
  headingKey:
    | "githubHeading"
    | "giteaHeading"
    | "gitlabHeading"
    | "jiraHeading";
  hintKey: "githubHint" | "giteaHint" | "gitlabHint" | "jiraHint";
}) {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h3 className="text-sm font-medium">
          {t(`settings:workflowEditor.${headingKey}`)}
        </h3>
        <p className="text-xs text-muted-foreground">
          {t(`settings:workflowEditor.${hintKey}`)}
        </p>
      </div>
      <WorkflowRulesPanel
        projectId={projectId}
        integrationType={integrationType}
      />
    </div>
  );
}
