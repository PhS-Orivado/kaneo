import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AccessVerificationLine } from "@/components/project/code-hosting/access-verification-line";
import { isAccessVerified } from "@/components/project/code-hosting/access-verification-tone";
import { isValidUrl } from "@/components/project/code-hosting/is-valid-url";
import {
  formatRepositoryPath,
  GITEA_OWNER_PATTERN,
  parseRepositoryPath,
} from "@/components/project/code-hosting/parse-repository-path";
import { RepositoryChoiceStep } from "@/components/project/code-hosting/repository-choice-step";
import { SelectedRepositoriesList } from "@/components/project/code-hosting/selected-repositories-list";
import { GiteaRepositoryPicker } from "@/components/project/gitea-integration/gitea-repository-picker";
import { GiteaSignInStep } from "@/components/project/gitea-integration/gitea-sign-in-step";
import { useGiteaVerification } from "@/components/project/gitea-integration/use-gitea-verification";
import { useSaveGiteaIntegration } from "@/components/project/gitea-integration/use-save-gitea-integration";
import { IntegrationPanel } from "@/components/project/integrations/panel/integration-panel";
import { IntegrationPanelFooter } from "@/components/project/integrations/panel/integration-panel-footer";
import { IntegrationSteps } from "@/components/project/integrations/panel/integration-steps";
import { Button } from "@/components/ui/button";

type GiteaSetupPanelProps = {
  projectId: string;
  onConnected?: () => void;
};

export function GiteaSetupPanel({ projectId, onConnected }: GiteaSetupPanelProps) {
  const { t } = useTranslation();
  const [baseUrl, setBaseUrl] = useState("");
  const [token, setToken] = useState("");
  const [path, setPath] = useState("");
  const [selection, setSelection] = useState<string[]>([]);
  const [connecting, setConnecting] = useState(false);
  const [touched, setTouched] = useState({ baseUrl: false, path: false });
  const [browsing, setBrowsing] = useState(false);
  const { save, saving } = useSaveGiteaIntegration(projectId);

  const trimmedUrl = baseUrl.trim();
  const trimmedToken = token.trim();
  const urlValid = isValidUrl(trimmedUrl);
  const repository = parseRepositoryPath(path, GITEA_OWNER_PATTERN);
  const access =
    urlValid && repository && trimmedToken
      ? {
          baseUrl: trimmedUrl,
          accessToken: trimmedToken,
          repositoryOwner: repository.owner,
          repositoryName: repository.name,
        }
      : null;
  const verification = useGiteaVerification(projectId, access);
  const verified = isAccessVerified(verification.result);
  const blocked = verification.result !== undefined && !verified;
  // Repositories picked in the browser connect together with the same
  // credentials; a typed path stays the single-repository flow.
  const targets =
    selection.length > 0
      ? selection
      : repository
        ? [formatRepositoryPath(repository.owner, repository.name)]
        : [];

  const baseUrlError = !touched.baseUrl
    ? null
    : !trimmedUrl
      ? t("settings:giteaIntegration.validation.baseUrlRequired")
      : urlValid
        ? null
        : t("settings:giteaIntegration.validation.baseUrlInvalid");
  const pathInvalid = touched.path && path.trim() !== "" && !repository;

  const removeTarget = (target: string) => {
    const remaining = selection.filter((item) => item !== target);
    setSelection(remaining);
    if (path === target) setPath(remaining[0] ?? "");
  };

  const connect = async () => {
    if (targets.length === 0) return;
    setConnecting(true);
    // One integration per repository: each gets its own webhook and settings.
    const connected: string[] = [];
    for (const [index, target] of targets.entries()) {
      const targetRepository = parseRepositoryPath(target, GITEA_OWNER_PATTERN);
      if (!targetRepository) continue;
      const ok = await save(
        {
          baseUrl: trimmedUrl,
          accessToken: trimmedToken,
          repositoryOwner: targetRepository.owner,
          repositoryName: targetRepository.name,
        },
        index === 0 ? verified : false,
      );
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
      if (connected.includes(path)) setPath(remaining[0]);
    }
  };

  return (
    <>
      <IntegrationPanel>
        <IntegrationSteps>
          <GiteaSignInStep
            baseUrl={baseUrl}
            token={token}
            baseUrlError={baseUrlError}
            disabled={saving}
            onBaseUrlChange={setBaseUrl}
            onBaseUrlBlur={() =>
              setTouched((current) => ({ ...current, baseUrl: true }))
            }
            onTokenChange={setToken}
          />
          <RepositoryChoiceStep
            title={t("settings:codeHosting.chooseRepositoryTitle")}
            description={t(
              "settings:giteaIntegration.chooseRepositoryDescription",
            )}
            inputLabel={t("settings:codeHosting.repositoryPathLabel")}
            placeholder="owner/repository"
            value={path}
            invalidMessage={
              pathInvalid
                ? t("settings:codeHosting.repositoryPathInvalid")
                : null
            }
            disabled={saving || connecting}
            browseDisabled={!trimmedUrl || !trimmedToken}
            status={
              <AccessVerificationLine
                {...verification}
                fallbackError={t("settings:giteaIntegration.toast.verifyError")}
              />
            }
            extra={
              targets.length > 1 ? (
                <SelectedRepositoriesList
                  repositories={targets}
                  disabled={saving || connecting}
                  onRemove={removeTarget}
                />
              ) : null
            }
            onChange={(next) => {
              setSelection([]);
              setPath(next);
            }}
            onBlur={() => setTouched((current) => ({ ...current, path: true }))}
            onBrowse={() => setBrowsing(true)}
          />
        </IntegrationSteps>
        <IntegrationPanelFooter>
          <Button
            type="button"
            loading={saving || connecting}
            disabled={!access || blocked}
            onClick={() => void connect()}
          >
            {targets.length > 1
              ? t("settings:codeHosting.connectRepositories", {
                  count: targets.length,
                })
              : t("settings:codeHosting.connectRepository")}
          </Button>
        </IntegrationPanelFooter>
      </IntegrationPanel>
      <GiteaRepositoryPicker
        open={browsing}
        projectId={projectId}
        onOpenChange={setBrowsing}
        onSelectRepositories={(repositories) => {
          const paths = repositories.map((item) =>
            formatRepositoryPath(item.owner, item.name),
          );
          setSelection(paths);
          setPath(paths[0] ?? "");
          setTouched((current) => ({ ...current, path: true }));
        }}
        selectedRepository={
          repository
            ? formatRepositoryPath(repository.owner, repository.name)
            : undefined
        }
        baseUrl={trimmedUrl}
        accessToken={trimmedToken}
      />
    </>
  );
}
