import { useState } from "react";
import { useTranslation } from "react-i18next";
import { RepositoryChoiceStep } from "@/components/project/code-hosting/repository-choice-step";
import {
  formatRepositoryPath,
  GITHUB_OWNER_PATTERN,
  parseRepositoryPath,
} from "@/components/project/code-hosting/parse-repository-path";
import { SelectedRepositoriesList } from "@/components/project/code-hosting/selected-repositories-list";
import { isGithubVerificationReady } from "@/components/project/github-integration/describe-github-verification";
import { GithubAccountStep } from "@/components/project/github-integration/github-account-step";
import { GithubRepositoryPicker } from "@/components/project/github-integration/github-repository-picker";
import { GithubVerificationLine } from "@/components/project/github-integration/github-verification-line";
import { useConnectGithubRepository } from "@/components/project/github-integration/use-connect-github-repository";
import { useGithubVerification } from "@/components/project/github-integration/use-github-verification";
import { IntegrationPanel } from "@/components/project/integrations/panel/integration-panel";
import { IntegrationPanelFooter } from "@/components/project/integrations/panel/integration-panel-footer";
import { IntegrationSteps } from "@/components/project/integrations/panel/integration-steps";
import { Button } from "@/components/ui/button";
import type { GitHubAppInfo } from "@/fetchers/github-integration/get-app-info";

type GithubSetupPanelProps = {
  projectId: string;
  appInfo: GitHubAppInfo | undefined;
  onConnected?: () => void;
};

export function GithubSetupPanel({ projectId, appInfo, onConnected }: GithubSetupPanelProps) {
  const { t } = useTranslation();
  const [value, setValue] = useState("");
  const [selection, setSelection] = useState<string[]>([]);
  const [connecting, setConnecting] = useState(false);
  const [touched, setTouched] = useState(false);
  const [browsing, setBrowsing] = useState(false);
  const linked = Boolean(appInfo?.accountConnected);
  const repository = parseRepositoryPath(value, GITHUB_OWNER_PATTERN);
  const verification = useGithubVerification(
    projectId,
    linked ? repository : null,
  );
  const { connect, connecting: connectingRepository } = useConnectGithubRepository(projectId);
  const blocked =
    verification.result !== undefined &&
    !isGithubVerificationReady(verification.result);
  const invalid = touched && value.trim() !== "" && repository === null;
  // Repositories picked in the browser connect together under the same
  // installation; a typed path stays the single-repository flow.
  const targets =
    selection.length > 0
      ? selection
      : repository
        ? [formatRepositoryPath(repository.owner, repository.name)]
        : [];

  const removeTarget = (target: string) => {
    const remaining = selection.filter((item) => item !== target);
    setSelection(remaining);
    if (value === target) setValue(remaining[0] ?? "");
  };

  const connectRepositories = async () => {
    if (targets.length === 0) return;
    setConnecting(true);
    // One integration per repository: each gets its own webhook and settings.
    const connected: string[] = [];
    for (const target of targets) {
      const targetRepository = parseRepositoryPath(target, GITHUB_OWNER_PATTERN);
      if (!targetRepository) continue;
      const ok = await connect(targetRepository);
      if (ok) connected.push(target);
    }
    setConnecting(false);
    if (connected.length === 0) return;
    const remaining = selection.filter((item) => !connected.includes(item));
    if (remaining.length === 0) {
      setSelection([]);
      onConnected?.();
    } else {
      setSelection(remaining);
      if (connected.includes(value)) setValue(remaining[0]);
    }
  };

  return (
    <>
      <IntegrationPanel>
        <IntegrationSteps>
          <GithubAccountStep appInfo={appInfo} />
          <RepositoryChoiceStep
            title={t("settings:codeHosting.chooseRepositoryTitle")}
            description={t(
              "settings:githubIntegration.chooseRepositoryDescription",
            )}
            inputLabel={t("settings:codeHosting.repositoryPathLabel")}
            placeholder="owner/repository"
            value={value}
            invalidMessage={
              invalid ? t("settings:codeHosting.repositoryPathInvalid") : null
            }
            disabled={connectingRepository || connecting}
            browseDisabled={!linked}
            status={<GithubVerificationLine {...verification} />}
            extra={
              targets.length > 1 ? (
                <SelectedRepositoriesList
                  repositories={targets}
                  disabled={connectingRepository || connecting}
                  onRemove={removeTarget}
                />
              ) : null
            }
            onChange={(next) => {
              setSelection([]);
              setValue(next);
              if (parseRepositoryPath(next, GITHUB_OWNER_PATTERN))
                setTouched(true);
            }}
            onBlur={() => setTouched(true)}
            onBrowse={() => setBrowsing(true)}
          />
        </IntegrationSteps>
        <IntegrationPanelFooter>
          <Button
            type="button"
            loading={connectingRepository || connecting}
            disabled={!linked || !repository || blocked}
            onClick={() => void connectRepositories()}
          >
            {targets.length > 1
              ? t("settings:codeHosting.connectRepositories", {
                  count: targets.length,
                })
              : t("settings:codeHosting.connectRepository")}
          </Button>
        </IntegrationPanelFooter>
      </IntegrationPanel>
      <GithubRepositoryPicker
        projectId={projectId}
        open={browsing}
        onOpenChange={setBrowsing}
        selectedRepository={
          repository
            ? formatRepositoryPath(repository.owner, repository.name)
            : undefined
        }
        onSelectRepositories={(repositories) => {
          const paths = repositories.map((item) =>
            formatRepositoryPath(item.owner, item.name),
          );
          setSelection(paths);
          setValue(paths[0] ?? "");
          setTouched(true);
        }}
      />
    </>
  );
}
