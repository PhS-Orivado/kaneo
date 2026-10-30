import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AccessVerificationLine } from "@/components/project/code-hosting/access-verification-line";
import { isAccessVerified } from "@/components/project/code-hosting/access-verification-tone";
import { isValidUrl } from "@/components/project/code-hosting/is-valid-url";
import { RepositoryChoiceStep } from "@/components/project/code-hosting/repository-choice-step";
import { SelectedRepositoriesList } from "@/components/project/code-hosting/selected-repositories-list";
import {
  GITLAB_CLOUD_URL,
  type GitlabTokenType,
  isValidProjectPath,
  normalizeProjectPath,
} from "@/components/project/gitlab-integration/gitlab-access";
import { GitlabProjectPicker } from "@/components/project/gitlab-integration/gitlab-project-picker";
import { GitlabSignInStep } from "@/components/project/gitlab-integration/gitlab-sign-in-step";
import { useGitlabVerification } from "@/components/project/gitlab-integration/use-gitlab-verification";
import { useSaveGitlabIntegration } from "@/components/project/gitlab-integration/use-save-gitlab-integration";
import { IntegrationPanel } from "@/components/project/integrations/panel/integration-panel";
import { IntegrationPanelFooter } from "@/components/project/integrations/panel/integration-panel-footer";
import { IntegrationSteps } from "@/components/project/integrations/panel/integration-steps";
import { Button } from "@/components/ui/button";

type GitlabSetupPanelProps = {
  projectId: string;
  onConnected?: () => void;
};

export function GitlabSetupPanel({ projectId, onConnected }: GitlabSetupPanelProps) {
  const { t } = useTranslation();
  const [baseUrl, setBaseUrl] = useState(GITLAB_CLOUD_URL);
  const [token, setToken] = useState("");
  const [tokenType, setTokenType] = useState<GitlabTokenType>("private");
  const [path, setPath] = useState("");
  const [selection, setSelection] = useState<string[]>([]);
  const [connecting, setConnecting] = useState(false);
  const [touched, setTouched] = useState({ baseUrl: false, path: false });
  const [browsing, setBrowsing] = useState(false);
  const { save, saving } = useSaveGitlabIntegration(projectId);

  const trimmedUrl = baseUrl.trim();
  const trimmedToken = token.trim();
  const urlValid = isValidUrl(trimmedUrl);
  const projectPath = normalizeProjectPath(path);
  const pathValid = isValidProjectPath(path);
  const access =
    urlValid && pathValid && trimmedToken
      ? {
          baseUrl: trimmedUrl,
          accessToken: trimmedToken,
          tokenType,
          projectPath,
        }
      : null;
  const verification = useGitlabVerification(projectId, access);
  const verified = isAccessVerified(verification.result);
  const blocked = verification.result !== undefined && !verified;
  // Projects picked in the browser connect together with the same
  // credentials; a typed path stays the single-project flow.
  const targets = selection.length > 0 ? selection : projectPath ? [projectPath] : [];

  const baseUrlError = !touched.baseUrl
    ? null
    : !trimmedUrl
      ? t("settings:gitlabIntegration.validation.baseUrlRequired")
      : urlValid
        ? null
        : t("settings:gitlabIntegration.validation.baseUrlInvalid");
  const pathInvalid = touched.path && path.trim() !== "" && !pathValid;

  const removeTarget = (target: string) => {
    const remaining = selection.filter((item) => item !== target);
    setSelection(remaining);
    if (path === target) setPath(remaining[0] ?? "");
  };

  const connect = async () => {
    if (targets.length === 0) return;
    setConnecting(true);
    // One integration per project: each gets its own webhook and settings.
    const connected: string[] = [];
    for (const [index, target] of targets.entries()) {
      const targetPath = normalizeProjectPath(target);
      if (!isValidProjectPath(targetPath)) continue;
      const ok = await save(
        {
          baseUrl: trimmedUrl,
          accessToken: trimmedToken,
          tokenType,
          projectPath: targetPath,
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
          <GitlabSignInStep
            baseUrl={baseUrl}
            token={token}
            tokenType={tokenType}
            baseUrlError={baseUrlError}
            disabled={saving}
            onBaseUrlChange={setBaseUrl}
            onBaseUrlBlur={() =>
              setTouched((current) => ({ ...current, baseUrl: true }))
            }
            onTokenChange={setToken}
            onTokenTypeChange={setTokenType}
          />
          <RepositoryChoiceStep
            title={t("settings:codeHosting.chooseProjectTitle")}
            description={t(
              "settings:gitlabIntegration.chooseProjectDescription",
            )}
            inputLabel={t("settings:gitlabIntegration.projectPathLabel")}
            placeholder="group/subgroup/project"
            value={path}
            invalidMessage={
              pathInvalid
                ? t("settings:gitlabIntegration.validation.pathInvalid")
                : null
            }
            disabled={saving || connecting}
            browseDisabled={!trimmedUrl || !trimmedToken}
            status={
              <AccessVerificationLine
                {...verification}
                fallbackError={t(
                  "settings:gitlabIntegration.toast.verifyError",
                )}
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
              ? t("settings:codeHosting.connectProjects", {
                  count: targets.length,
                })
              : t("settings:codeHosting.connectProject")}
          </Button>
        </IntegrationPanelFooter>
      </IntegrationPanel>
      <GitlabProjectPicker
        open={browsing}
        projectId={projectId}
        onOpenChange={setBrowsing}
        onSelectProjects={(paths) => {
          setSelection(paths);
          setPath(paths[0] ?? "");
          setTouched((current) => ({ ...current, path: true }));
        }}
        selectedProjectPath={projectPath || undefined}
        baseUrl={trimmedUrl}
        accessToken={trimmedToken}
        tokenType={tokenType}
      />
    </>
  );
}
