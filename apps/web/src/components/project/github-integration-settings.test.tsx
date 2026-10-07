import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";

const m = vi.hoisted(() => ({
  appInfo: vi.fn(),
  link: vi.fn(),
  importIssues: vi.fn(),
  create: vi.fn(),
  list: { current: null as null | Record<string, unknown> },
}));
vi.mock("@/fetchers/github-integration/get-app-info", () => ({
  default: m.appInfo,
}));
vi.mock("@/lib/auth-client", () => ({
  authClient: {
    useSession: () => ({ data: { user: { id: "user-1" } } }),
    linkSocial: m.link,
  },
}));
vi.mock(
  "@/hooks/queries/github-integration/use-list-github-integrations",
  () => ({
    default: () => ({
      data: m.list.current,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    }),
  }),
);
vi.mock(
  "@/hooks/mutations/github-integration/use-create-github-integration",
  () => ({
    useCreateGithubIntegration: () => ({
      mutateAsync: m.create,
      isPending: false,
    }),
    useDeleteGithubIntegration: () => ({
      mutateAsync: vi.fn(),
      isPending: false,
    }),
    useVerifyGithubInstallation: () => ({
      mutateAsync: vi.fn(),
      isPending: false,
    }),
  }),
);
vi.mock(
  "@/hooks/mutations/github-integration/use-import-github-issues",
  () => ({
    default: () => ({ mutateAsync: m.importIssues, isPending: false }),
  }),
);
vi.mock(
  "@/hooks/mutations/github-integration/use-update-github-integration",
  () => ({
    useUpdateGithubIntegration: () => ({
      mutateAsync: vi.fn(),
      isPending: false,
    }),
  }),
);
// The browser is exercised through its own tests; here it only needs to offer
// a selection so the add flow of the shell can be driven end to end.
vi.mock("@/components/project/repository-browser-modal", () => ({
  RepositoryBrowserModal: ({
    open,
    onSelectRepository,
  }: {
    open: boolean;
    onSelectRepository: (repository: { owner: string; name: string }) => void;
  }) =>
    open ? (
      <button
        type="button"
        onClick={() => onSelectRepository({ owner: "owner", name: "picked" })}
      >
        browser-select
      </button>
    ) : null,
}));
const permissions = vi.hoisted(() => ({ create: true, update: true }));
vi.mock("@/hooks/use-workspace-permission", () => ({
  useWorkspacePermission: () => ({
    canCreateTasks: () => permissions.create,
    canUpdateTasks: () => permissions.update,
  }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));
vi.mock("@/lib/toast", () => ({
  toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));

import { toast } from "@/lib/toast";
import { GitHubIntegrationSettings } from "./github-integration-settings";

const activeBinding = {
  id: "integration-1",
  projectId: "project",
  repositoryOwner: "owner",
  repositoryName: "repo",
  installationId: 1,
  requiresVerification: false,
  importProgress: {
    runId: "saved-run",
    pending: true,
    imported: 4,
    updated: 0,
    skipped: 0,
  },
  isActive: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};
const legacyBinding = {
  id: "integration-2",
  projectId: "project",
  repositoryOwner: "legacy",
  repositoryName: "old",
  installationId: null,
  requiresVerification: true,
  isActive: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function show() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <GitHubIntegrationSettings projectId="project" />
    </QueryClientProvider>,
  );
}
afterEach(() => cleanup());
beforeEach(() => {
  vi.clearAllMocks();
  m.list.current = null;
  m.appInfo.mockResolvedValue({
    accountConnected: true,
    accountLinkingAvailable: true,
  });
  m.link.mockResolvedValue({ error: null });
  m.create.mockResolvedValue({});
  m.importIssues.mockResolvedValue({ imported: 9, updated: 1, skipped: 2 });
  permissions.create = true;
  permissions.update = true;
});

describe("GitHub account verification flow", () => {
  it("offers explicit account linking and returns to the same settings page", async () => {
    m.appInfo.mockResolvedValue({
      accountConnected: false,
      accountLinkingAvailable: true,
    });
    show();
    const button = await screen.findByRole("button", {
      name: "settings:githubIntegration.connect GitHub",
    });
    fireEvent.click(button);
    await waitFor(() =>
      expect(m.link).toHaveBeenCalledWith({
        provider: "github",
        callbackURL: window.location.href,
      }),
    );
  });
  it("explains the administrator prerequisite when GitHub sign-in is disabled", async () => {
    m.appInfo.mockResolvedValue({
      accountConnected: false,
      accountLinkingAvailable: false,
    });
    show();
    expect(
      await screen.findByText(
        "settings:githubIntegration.enableGithubSignInHint",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", {
        name: "settings:githubIntegration.connect GitHub",
      }),
    ).not.toBeInTheDocument();
  });
});

describe("repository binding list (RFC 0001 WP7)", () => {
  it("lists every binding with its status chip and the plan usage", async () => {
    m.list.current = {
      integrations: [activeBinding, legacyBinding],
      usage: { used: 2, limit: 5 },
    };
    show();
    expect(
      await screen.findByText("settings:repositoryBindings.usageLimited"),
    ).toBeInTheDocument();
    expect(screen.getByText("owner/repo")).toBeInTheDocument();
    expect(screen.getByText("legacy/old")).toBeInTheDocument();
    expect(
      screen.getByText("settings:repositoryBindings.statusActive"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("settings:repositoryBindings.statusNeedsVerification"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("settings:repositoryBindings.importMeta"),
    ).toBeInTheDocument();
  });
  it("shows the first-binding connect form while the project has no binding", async () => {
    m.list.current = { integrations: [], usage: { used: 0, limit: null } };
    show();
    expect(
      await screen.findByText("settings:repositoryBindings.addFirstTitle"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "settings:githubIntegration.browse" }),
    ).toBeEnabled();
  });
  it("creates a picked browser repository as a new binding", async () => {
    m.list.current = {
      integrations: [activeBinding],
      usage: { used: 1, limit: 5 },
    };
    show();
    fireEvent.click(
      await screen.findByRole("button", {
        name: "settings:repositoryBindings.addMore",
      }),
    );
    fireEvent.click(await screen.findByText("browser-select"));
    await waitFor(() =>
      expect(m.create).toHaveBeenCalledWith({
        projectId: "project",
        data: { repositoryOwner: "owner", repositoryName: "picked" },
      }),
    );
  });
});

describe("saved GitHub import progress", () => {
  it("resumes through the row menu and forwards the persisted run ID", async () => {
    m.list.current = {
      integrations: [activeBinding],
      usage: { used: 1, limit: 5 },
    };
    show();
    fireEvent.click(
      await screen.findByRole("button", {
        name: "settings:repositoryBindings.rowMenuLabel",
      }),
    );
    const importItem = await screen.findByText(
      "settings:repositoryBindings.actionImportIssues",
    );
    expect(importItem).toBeEnabled();
    fireEvent.click(importItem);
    await waitFor(() =>
      expect(m.importIssues).toHaveBeenCalledWith({
        integrationId: "integration-1",
        projectId: "project",
        runId: "saved-run",
      }),
    );
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        "settings:githubIntegration.toast.issuesImported",
        { description: "settings:githubIntegration.importSummary" },
      ),
    );
  });
  it("keeps a binding that needs verification non-importable", async () => {
    m.list.current = {
      integrations: [legacyBinding],
      usage: { used: 1, limit: 5 },
    };
    show();
    fireEvent.click(
      await screen.findByRole("button", {
        name: "settings:repositoryBindings.rowMenuLabel",
      }),
    );
    const importItem = await screen.findByText(
      "settings:repositoryBindings.actionImportIssues",
    );
    expect(importItem).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(importItem);
    expect(m.importIssues).not.toHaveBeenCalled();
  });
});

it("disables the import action without create or update permission", async () => {
  permissions.create = false;
  m.list.current = {
    integrations: [activeBinding],
    usage: { used: 1, limit: 5 },
  };
  show();
  fireEvent.click(
    await screen.findByRole("button", {
      name: "settings:repositoryBindings.rowMenuLabel",
    }),
  );
  const importItem = await screen.findByText(
    "settings:repositoryBindings.actionImportIssues",
  );
  expect(importItem).toHaveAttribute("aria-disabled", "true");
  fireEvent.click(importItem);
  expect(m.importIssues).not.toHaveBeenCalled();
});
