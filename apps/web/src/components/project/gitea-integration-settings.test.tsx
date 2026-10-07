import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const m = vi.hoisted(() => ({
  importIssues: vi.fn(),
  create: vi.fn(),
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
vi.mock("@/hooks/queries/gitea-integration/use-list-gitea-integrations", () => ({
  default: () => ({
    data: m.list.current,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));
vi.mock(
  "@/hooks/mutations/gitea-integration/use-create-gitea-integration",
  () => ({
    useVerifyGiteaAccess: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useCreateGiteaIntegration: () => ({
      mutateAsync: m.create,
      isPending: false,
    }),
    useDeleteGiteaIntegration: () => ({
      mutateAsync: vi.fn(),
      isPending: false,
    }),
  }),
);
vi.mock(
  "@/hooks/mutations/gitea-integration/use-update-gitea-integration",
  () => ({
    useUpdateGiteaIntegration: () => ({
      mutateAsync: vi.fn(),
      isPending: false,
    }),
  }),
);
vi.mock("@/hooks/mutations/gitea-integration/use-import-gitea-issues", () => ({
  default: () => ({ mutateAsync: m.importIssues, isPending: false }),
}));
// The browser is exercised through its own tests; the shell only needs the
// modal to stay inert here.
vi.mock("@/components/project/gitea-repository-browser-modal", () => ({
  GiteaRepositoryBrowserModal: () => null,
}));
vi.mock(
  "@/components/project/integration-repositories/gitea-add-repository-dialog",
  () => ({
    GiteaAddRepositoryDialog: ({ open }: { open: boolean }) =>
      open ? <button type="button">add-dialog-open</button> : null,
  }),
);
vi.mock("@/lib/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

import { GiteaIntegrationSettings } from "./gitea-integration-settings";

const binding = {
  id: "integration-1",
  projectId: "project",
  baseUrl: "https://gitea.example",
  repositoryOwner: "owner",
  repositoryName: "repo",
  maskedAccessToken: "gitea_****",
  webhookUrl: "https://kaneo.example/hooks/gitea/abc",
  webhookSecret: "wombat-secret",
  commentTaskLinkOnGiteaIssue: true,
  isActive: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function show() {
  return render(<GiteaIntegrationSettings projectId="project" />);
}
afterEach(() => {
  cleanup();
  permissions.create = true;
  permissions.update = true;
  vi.clearAllMocks();
});
beforeEach(() => {
  m.list.current = null;
  m.create.mockResolvedValue({});
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
    expect(screen.getByText("owner/repo")).toBeInTheDocument();
    expect(screen.getByText("https://gitea.example")).toBeInTheDocument();
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
    expect(
      screen.getByRole("button", { name: "settings:giteaIntegration.browse" }),
    ).toBeEnabled();
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
