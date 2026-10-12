import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import { useIntegrationStatuses } from "@/components/project/integrations/use-integration-statuses";
const fetchers = vi.hoisted(() => ({
  github: vi.fn(),
  gitea: vi.fn(),
  gitlab: vi.fn(),
  slack: vi.fn(),
  discord: vi.fn(),
  mattermost: vi.fn(),
  telegram: vi.fn(),
  webhook: vi.fn(),
}));
vi.mock("@/fetchers/github-integration/list-github-integrations", () => ({
  default: fetchers.github,
}));
vi.mock("@/fetchers/gitea-integration/list-gitea-integrations", () => ({
  default: fetchers.gitea,
}));
vi.mock("@/fetchers/gitlab-integration/list-gitlab-integrations", () => ({
  default: fetchers.gitlab,
}));
vi.mock("@/fetchers/slack-integration/get-slack-integration", () => ({
  default: fetchers.slack,
}));
vi.mock("@/fetchers/discord-integration/get-discord-integration", () => ({
  default: fetchers.discord,
}));
vi.mock("@/fetchers/mattermost-integration/get-mattermost-integration", () => ({
  default: fetchers.mattermost,
}));
vi.mock("@/fetchers/telegram-integration/get-telegram-integration", () => ({
  default: fetchers.telegram,
}));
vi.mock(
  "@/fetchers/generic-webhook-integration/get-generic-webhook-integration",
  () => ({ default: fetchers.webhook }),
);

const githubBinding = {
  id: "integration-1",
  projectId: "p1",
  repositoryOwner: "acme",
  repositoryName: "web",
  installationId: 1,
  requiresVerification: false,
  isActive: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};
const emptyList = { integrations: [], usage: { used: 0, limit: null } };
const bindingList = {
  integrations: [githubBinding],
  usage: { used: 1, limit: null },
};

let client: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  for (const fetcher of Object.values(fetchers))
    fetcher.mockReset().mockResolvedValue(null);
  fetchers.github.mockResolvedValue(emptyList);
  fetchers.gitea.mockResolvedValue(emptyList);
  fetchers.gitlab.mockResolvedValue(emptyList);
});
afterEach(() => {
  cleanup();
  client.clear();
});
describe("useIntegrationStatuses", () => {
  it("reads all integrations without a management permission gate", async () => {
    fetchers.slack.mockResolvedValue({
      webhookConfigured: true,
      channelName: "general",
      isActive: true,
    });
    const { result } = renderHook(() => useIntegrationStatuses("p1"), {
      wrapper,
    });
    await waitFor(() =>
      expect(result.current.statuses.slack).toEqual({
        state: "connected",
        detail: "#general",
      }),
    );
    for (const fetcher of Object.values(fetchers))
      expect(fetcher).toHaveBeenCalledWith("p1");
    expect(result.current.statuses.github.state).toBe("disconnected");
  });
  it("keeps pending requests unknown until configuration arrives", async () => {
    let resolve!: (value: unknown) => void;
    fetchers.github.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const { result } = renderHook(() => useIntegrationStatuses("p1"), {
      wrapper,
    });
    expect(result.current.statuses.github.state).toBe("loading");
    await act(async () => {
      resolve(bindingList);
    });
    await waitFor(() =>
      expect(result.current.statuses.github).toEqual({
        state: "connected",
        details: ["acme/web"],
      }),
    );
  });
  it("retries only the failed integration and recovers", async () => {
    fetchers.github
      .mockRejectedValueOnce(new Error("Network unavailable"))
      .mockResolvedValue(emptyList);
    const { result } = renderHook(() => useIntegrationStatuses("p1"), {
      wrapper,
    });
    await waitFor(() =>
      expect(result.current.statuses.github.state).toBe("unavailable"),
    );
    act(() => result.current.retry("github"));
    await waitFor(() =>
      expect(result.current.statuses.github.state).toBe("disconnected"),
    );
    expect(fetchers.github).toHaveBeenCalledTimes(2);
    for (const [id, fetcher] of Object.entries(fetchers))
      if (id !== "github") expect(fetcher).toHaveBeenCalledOnce();
  });
  it("starts with an unknown status when switching projects", async () => {
    fetchers.github.mockImplementation((projectId: string) =>
      projectId === "p1" ? Promise.resolve(bindingList) : new Promise(() => {}),
    );
    const { result, rerender } = renderHook(
      ({ projectId }) => useIntegrationStatuses(projectId),
      { initialProps: { projectId: "p1" }, wrapper },
    );
    await waitFor(() =>
      expect(result.current.statuses.github.state).toBe("connected"),
    );
    rerender({ projectId: "p2" });
    expect(result.current.statuses.github.state).toBe("loading");
    expect(result.current.statuses.github.details).toBeUndefined();
  });
  it("shows loading during a delayed retry and reuses the in-flight request", async () => {
    let resolve!: (value: unknown) => void;
    fetchers.github
      .mockRejectedValueOnce(new Error("Network unavailable"))
      .mockReturnValue(
        new Promise((done) => {
          resolve = done;
        }),
      );
    const { result } = renderHook(() => useIntegrationStatuses("p1"), {
      wrapper,
    });
    await waitFor(() =>
      expect(result.current.statuses.github.state).toBe("unavailable"),
    );
    act(() => result.current.retry("github"));
    await waitFor(() =>
      expect(result.current.statuses.github.state).toBe("loading"),
    );
    act(() => result.current.retry("github"));
    expect(fetchers.github).toHaveBeenCalledTimes(2);
    await act(async () => {
      resolve(emptyList);
    });
    await waitFor(() =>
      expect(result.current.statuses.github.state).toBe("disconnected"),
    );
  });
  it("reports every binding of a multi-binding project in the details", async () => {
    fetchers.gitea.mockResolvedValue({
      integrations: [
        {
          id: "integration-a",
          projectId: "p1",
          baseUrl: "https://gitea.example",
          repositoryOwner: "first",
          repositoryName: "repo",
          maskedAccessToken: "gitea_****",
          commentTaskLinkOnGiteaIssue: true,
          isActive: true,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
        {
          id: "integration-b",
          projectId: "p1",
          baseUrl: "https://gitea.example",
          repositoryOwner: "second",
          repositoryName: "repo",
          maskedAccessToken: "gitea_****",
          commentTaskLinkOnGiteaIssue: true,
          isActive: false,
          createdAt: "2026-01-02T00:00:00.000Z",
          updatedAt: "2026-01-02T00:00:00.000Z",
        },
      ],
      usage: { used: 2, limit: 5 },
    });
    const { result } = renderHook(() => useIntegrationStatuses("p1"), {
      wrapper,
    });
    await waitFor(() =>
      expect(result.current.statuses.gitea).toEqual({
        state: "connected",
        details: ["first/repo", "second/repo"],
      }),
    );
  });

  it.each([
    {
      data: bindingList,
      expected: { state: "connected", details: ["acme/web"] },
    },
    {
      data: {
        integrations: [{ ...githubBinding, isActive: false }],
        usage: { used: 1, limit: null },
      },
      expected: { state: "paused", details: ["acme/web"] },
    },
    { data: emptyList, expected: { state: "disconnected" } },
  ])(
    "keeps the last loaded status after a failed background refresh: $expected.state",
    async ({ data, expected }) => {
      fetchers.github
        .mockResolvedValueOnce(data)
        .mockRejectedValue(new Error("Network unavailable"));
      const { result } = renderHook(() => useIntegrationStatuses("p1"), {
        wrapper,
      });
      await waitFor(() =>
        expect(result.current.statuses.github).toEqual(expected),
      );
      await act(async () => {
        await client.refetchQueries({
          queryKey: ["github-integrations", "p1"],
        });
      });
      expect(client.getQueryState(["github-integrations", "p1"])?.status).toBe(
        "error",
      );
      expect(result.current.statuses.github).toEqual(expected);
    },
  );
});
