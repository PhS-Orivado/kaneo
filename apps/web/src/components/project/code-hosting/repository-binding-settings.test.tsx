import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

// RFC 0001 WP7: the code hosting settings render one panel per repository
// binding and reuse the same setup flow to add more repositories. The matrix
// below applies to all three providers because their settings components
// share the same shape on top of the plural `use-get-*-integrations` hooks.

const m = vi.hoisted(() => {
  const provider = () => ({
    data: undefined as
      | { integrations: Record<string, unknown>[]; usage: unknown }
      | undefined,
    isLoading: false,
    error: undefined as undefined | Error,
    refetch: vi.fn(),
    connected: [] as Record<string, unknown>[],
    setup: [] as Record<string, unknown>[],
    appInfo: undefined as Record<string, unknown> | undefined,
  });
  return { github: provider(), gitea: provider(), gitlab: provider() };
});

function bindingId(integration: unknown): string {
  return String((integration as { id: string }).id);
}

const hookResult = (provider: (typeof m)["github"]) => ({
  data: provider.data,
  isLoading: provider.isLoading,
  error: provider.error,
  refetch: provider.refetch,
});

vi.mock(
  "@/hooks/queries/github-integration/use-get-github-integrations",
  () => ({ default: () => hookResult(m.github) }),
);
vi.mock(
  "@/hooks/queries/gitea-integration/use-get-gitea-integrations",
  () => ({ default: () => hookResult(m.gitea) }),
);
vi.mock(
  "@/hooks/queries/gitlab-integration/use-get-gitlab-integrations",
  () => ({ default: () => hookResult(m.gitlab) }),
);
vi.mock("@/components/project/github-integration/use-github-app-info", () => ({
  useGithubAppInfo: () => ({ data: m.github.appInfo }),
}));
vi.mock(
  "@/components/project/github-integration/github-connected-panel",
  () => ({
    GithubConnectedPanel: (props: Record<string, unknown>) => {
      m.github.connected.push(props);
      return (
        <div data-testid={`github-connected-${bindingId(props.integration)}`} />
      );
    },
  }),
);
vi.mock("@/components/project/github-integration/github-setup-panel", () => ({
  GithubSetupPanel: (props: {
    projectId: string;
    appInfo?: unknown;
    onConnected?: () => void;
  }) => {
    m.github.setup.push(props as unknown as Record<string, unknown>);
    return (
      <button type="button" onClick={() => props.onConnected?.()}>
        github-setup
      </button>
    );
  },
}));
vi.mock(
  "@/components/project/gitea-integration/gitea-connected-panel",
  () => ({
    GiteaConnectedPanel: (props: Record<string, unknown>) => {
      m.gitea.connected.push(props);
      return (
        <div data-testid={`gitea-connected-${bindingId(props.integration)}`} />
      );
    },
  }),
);
vi.mock("@/components/project/gitea-integration/gitea-setup-panel", () => ({
  GiteaSetupPanel: (props: {
    projectId: string;
    onConnected?: () => void;
  }) => {
    m.gitea.setup.push(props as unknown as Record<string, unknown>);
    return (
      <button type="button" onClick={() => props.onConnected?.()}>
        gitea-setup
      </button>
    );
  },
}));
vi.mock(
  "@/components/project/gitlab-integration/gitlab-connected-panel",
  () => ({
    GitlabConnectedPanel: (props: Record<string, unknown>) => {
      m.gitlab.connected.push(props);
      return (
        <div data-testid={`gitlab-connected-${bindingId(props.integration)}`} />
      );
    },
  }),
);
vi.mock("@/components/project/gitlab-integration/gitlab-setup-panel", () => ({
  GitlabSetupPanel: (props: {
    projectId: string;
    onConnected?: () => void;
  }) => {
    m.gitlab.setup.push(props as unknown as Record<string, unknown>);
    return (
      <button type="button" onClick={() => props.onConnected?.()}>
        gitlab-setup
      </button>
    );
  },
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { GitlabIntegrationSettings } from "@/components/project/gitlab-integration/gitlab-integration-settings";
import { GiteaIntegrationSettings } from "@/components/project/gitea-integration/gitea-integration-settings";
import { GitHubIntegrationSettings } from "@/components/project/github-integration/github-integration-settings";

const ADD_KEY = "settings:codeHosting.addAnotherRepository";

const settings = {
  github: GitHubIntegrationSettings,
  gitea: GiteaIntegrationSettings,
  gitlab: GitlabIntegrationSettings,
} as const;

// GitHub's panels additionally receive the App info; the other providers
// assert only the multi-binding contract shared by all three.
type ProviderId = keyof typeof settings & keyof typeof m;

const bindings = [
  { id: "binding-1", repositoryName: "web" },
  { id: "binding-2", repositoryName: "api" },
];

beforeEach(() => {
  vi.clearAllMocks();
  for (const provider of [m.github, m.gitea, m.gitlab]) {
    provider.data = undefined;
    provider.error = undefined;
    provider.isLoading = false;
    provider.connected.length = 0;
    provider.setup.length = 0;
    provider.appInfo = undefined;
  }
});

afterEach(() => cleanup());

function show(provider: ProviderId) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const Settings = settings[provider] as typeof GitHubIntegrationSettings;
  return render(
    <QueryClientProvider client={client}>
      <Settings projectId="project" />
    </QueryClientProvider>,
  );
}

describe.each(["github", "gitea", "gitlab"] as const)(
  "%s settings multi-repository binding list",
  (provider) => {
    const state = () => m[provider];
    const connectedPanels = () =>
      screen.queryAllByTestId(new RegExp(`^${provider}-connected-`));
    const addPanelKey = () => `${provider}-setup`;

    it("renders one connected panel per repository binding", () => {
      state().data = { integrations: bindings, usage: { used: 2, limit: null } };
      m.github.appInfo = { accountConnected: true, appName: "kaneo" };
      show(provider);
      const panels = connectedPanels();
      expect(panels).toHaveLength(2);
      expect(panels.map((panel) => panel.dataset.testid)).toEqual([
        `${provider}-connected-binding-1`,
        `${provider}-connected-binding-2`,
      ]);
      expect(
        state().connected.map((props) => props.projectId),
      ).toEqual(["project", "project"]);
      // The shared setup flow is not rendered next to connected panels.
      expect(screen.queryByText(addPanelKey())).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: ADD_KEY })).toBeInTheDocument();
    });

    it("shows only the setup flow when no repository is bound", () => {
      state().data = { integrations: [], usage: { used: 0, limit: null } };
      show(provider);
      expect(connectedPanels()).toHaveLength(0);
      expect(screen.getByText(addPanelKey())).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: ADD_KEY }),
      ).not.toBeInTheDocument();
      // Without a binding there is nothing to return to, so the setup flow
      // receives no completion callback.
      expect(state().setup.at(-1)?.onConnected).toBeUndefined();
    });

    it("reuses the setup flow to add another repository", () => {
      state().data = { integrations: bindings, usage: { used: 2, limit: null } };
      show(provider);
      expect(screen.queryByText(addPanelKey())).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: ADD_KEY }));
      // While adding, the second setup flow replaces the add button.
      expect(screen.getByText(addPanelKey())).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: ADD_KEY }),
      ).not.toBeInTheDocument();
      expect(typeof state().setup.at(-1)?.onConnected).toBe("function");

      fireEvent.click(screen.getByText(addPanelKey()));
      // Completing the flow closes it and brings the add button back.
      expect(screen.queryByText(addPanelKey())).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: ADD_KEY })).toBeInTheDocument();
    });

    it("shows the loading skeleton without panels", () => {
      state().isLoading = true;
      show(provider);
      expect(screen.getByRole("status")).toBeInTheDocument();
      expect(connectedPanels()).toHaveLength(0);
      expect(screen.queryByText(addPanelKey())).not.toBeInTheDocument();
    });

    it("offers a retry when the bindings cannot be loaded", () => {
      state().error = new Error("boom");
      show(provider);
      expect(screen.getByText("boom")).toBeInTheDocument();
      const retry = screen.getByRole("button", {
        name: "settings:codeHosting.retry",
      });
      fireEvent.click(retry);
      expect(state().refetch).toHaveBeenCalledTimes(1);
    });
  },
);
