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

// RFC 0001 WP9 (ledger item 6.6): the GitLab settings shell matches the
// GitHub and Gitea suites — list with instance host and plan usage, the
// first-binding entry point, the add dialog for further bindings, and the
// row menu import keyed by the integration id with permission gating.
const m = vi.hoisted(() => ({
  importIssues: vi.fn(),
  list: { current: null as null | Record<string, unknown> },
}));
const permissions = vi.hoisted(() => ({ create: true, update: true }));
vi.mock("@/hooks/use-workspace-permission", () => ({
  useWorkspacePermission: () => ({
    canCreateTasks: () => permissions.create,
    canUpdateTasks: () => permissions.update,
  }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock(
  "@/hooks/queries/gitlab-integration/use-list-gitlab-integrations",
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
  "@/hooks/mutations/gitlab-integration/use-create-gitlab-integration",
  () => ({
    useCreateGitlabIntegration: () => ({
      mutateAsync: vi.fn(),
      isPending: false,
    }),
    useDeleteGitlabIntegration: () => ({
      mutateAsync: vi.fn(),
      isPending: false,
    }),
    useVerifyGitlabAccess: () => ({ mutateAsync: vi.fn(), isPending: false }),
  }),
);
vi.mock(
  "@/hooks/mutations/gitlab-integration/use-update-gitlab-integration",
  () => ({
    useUpdateGitlabIntegration: () => ({
      mutateAsync: vi.fn(),
      isPending: false,
    }),
  }),
);
vi.mock(
  "@/hooks/mutations/gitlab-integration/use-import-gitlab-issues",
  () => ({
    default: () => ({ mutateAsync: m.importIssues, isPending: false }),
  }),
);
// The browsers are exercised through their own tests; the shell only needs
// the modal to stay inert here.
vi.mock("@/components/project/gitlab-project-browser-modal", () => ({
  GitlabProjectBrowserModal: () => null,
}));
vi.mock(
  "@/components/project/integration-repositories/gitlab-add-repository-dialog",
  () => ({
    GitlabAddRepositoryDialog: ({ open }: { open: boolean }) =>
      open ? <button type="button">add-dialog-open</button> : null,
  }),
);
// The connect form's verification snapshot logic is separate from this
// shell; a stub keeps this suite on the list, add and row-menu behavior.
vi.mock(
  "@/components/project/integration-repositories/gitlab-connect-form",
  () => ({
    GitlabConnectForm: () => <button type="button">gitlab-connect-form</button>,
  }),
);
vi.mock("@/lib/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

import { GitlabIntegrationSettings } from "./gitlab-integration-settings";

const binding = {
  id: "integration-1",
  projectId: "project",
  baseUrl: "https://gitlab.example",
  projectPath: "team/repo",
  tokenType: "private",
  maskedAccessToken: "glpat-****",
  webhookUrl: "https://kaneo.example/api/gitlab-integration/webhook/abc",
  webhookSecret: "wombat-secret",
  commentTaskLinkOnGitlabIssue: true,
  isActive: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function show() {
  return render(<GitlabIntegrationSettings projectId="project" />);
}
afterEach(() => {
  cleanup();
  permissions.create = true;
  permissions.update = true;
  vi.clearAllMocks();
});
beforeEach(() => {
  m.list.current = null;
  m.importIssues.mockResolvedValue({});
});

describe("repository binding list (RFC 0001 WP7)", () => {
  it("lists the binding with its instance host and the plan usage", async () => {
    m.list.current = {
      integrations: [binding],
      usage: { used: 1, limit: 3 },
    };
    show();
    expect(
      await screen.findByText("settings:repositoryBindings.usageLimited"),
    ).toBeInTheDocument();
    expect(screen.getByText("team/repo")).toBeInTheDocument();
    expect(screen.getByText("https://gitlab.example")).toBeInTheDocument();
    expect(
      screen.getByText("settings:repositoryBindings.statusActive"),
    ).toBeInTheDocument();
  });

  it("shows the first-binding connect form while the project has no binding", async () => {
    m.list.current = { integrations: [], usage: { used: 0, limit: null } };
    show();
    expect(
      await screen.findByText("settings:repositoryBindings.addFirstTitle"),
    ).toBeInTheDocument();
    expect(screen.getByText("gitlab-connect-form")).toBeInTheDocument();
  });

  it("opens the add dialog for a further binding", async () => {
    m.list.current = {
      integrations: [binding],
      usage: { used: 1, limit: 3 },
    };
    show();
    fireEvent.click(
      await screen.findByRole("button", {
        name: "settings:repositoryBindings.addMore",
      }),
    );
    expect(await screen.findByText("add-dialog-open")).toBeInTheDocument();
  });

  it("imports through the row menu keyed by the integration id", async () => {
    m.list.current = {
      integrations: [binding],
      usage: { used: 1, limit: 3 },
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
      }),
    );
  });
});

it("disables the import action without create or update permission", async () => {
  permissions.create = false;
  m.list.current = {
    integrations: [binding],
    usage: { used: 1, limit: 3 },
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
