import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { JiraLinkRewrite } from "@/components/import/jira-link-rewrite";
import type { RewriteJiraLinksResponse } from "@/fetchers/import/rewrite-jira-links";

const m = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  reset: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  state: { isPending: false as boolean, isError: false as boolean },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, number | string>) => {
      const values = Object.entries(options ?? {})
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, value]) => `${name}:${value}`);
      return values.length ? `${key}|${values.join("|")}` : key;
    },
  }),
}));

vi.mock("@/lib/toast", () => ({
  toast: { success: m.toastSuccess, error: m.toastError },
}));

vi.mock("@/hooks/mutations/import/use-rewrite-jira-links", () => ({
  default: () => ({
    mutateAsync: m.mutateAsync,
    isPending: m.state.isPending,
    isError: m.state.isError,
    reset: m.reset,
  }),
}));

afterEach(() => {
  cleanup();
  m.mutateAsync.mockReset();
  m.reset.mockClear();
  m.toastError.mockClear();
  m.toastSuccess.mockClear();
  m.state.isPending = false;
  m.state.isError = false;
});

function report(
  patch: Partial<RewriteJiraLinksResponse>,
): RewriteJiraLinksResponse {
  return {
    dryRun: true,
    replacements: [],
    unresolved: [],
    updatedTasks: 0,
    updatedComments: 0,
    ...patch,
  };
}

function renderSection() {
  return render(<JiraLinkRewrite workspaceId="ws1" />);
}

function findButton() {
  return screen.getByRole("button", {
    name: "settings:workspaceImport.jiraLinks.find",
  });
}

describe("JiraLinkRewrite", () => {
  it("renders the card with the find button", () => {
    renderSection();

    expect(
      screen.getByRole("heading", {
        name: "settings:workspaceImport.jiraLinks.title",
      }),
    ).toBeInTheDocument();
    expect(findButton()).toBeInTheDocument();
  });

  it("asks for a dry-run report and lists the replacements", async () => {
    m.mutateAsync.mockResolvedValueOnce(
      report({
        replacements: [
          {
            sourceUrl: "https://jira.example.com/browse/ABC-1",
            targetUrl:
              "http://localhost:5173/dashboard/workspace/ws1/project/p1/task/t1",
            targetTicketId: "ABC-1",
            targetTitle: "Fix login",
            taskId: "t1",
            commentId: null,
          },
        ],
        updatedTasks: 1,
        updatedComments: 1,
      }),
    );

    renderSection();
    fireEvent.click(findButton());

    await waitFor(() =>
      expect(m.mutateAsync).toHaveBeenCalledWith({
        workspaceId: "ws1",
        dryRun: true,
      }),
    );
    expect(await screen.findByText("ABC-1")).toBeInTheDocument();
    expect(screen.getByText("Fix login")).toBeInTheDocument();
    expect(
      screen.getByText("https://jira.example.com/browse/ABC-1"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "settings:workspaceImport.jiraLinks.apply|count:1",
      }),
    ).toBeEnabled();
  });

  it("applies the rewrite when the dialog button is used", async () => {
    m.mutateAsync
      .mockResolvedValueOnce(report({}))
      .mockResolvedValueOnce(
        report({
          dryRun: false,
          replacements: [
            {
              sourceUrl: "https://jira.example.com/browse/ABC-1",
              targetUrl:
                "http://localhost:5173/dashboard/workspace/ws1/project/p1/task/t1",
              targetTicketId: "ABC-1",
              targetTitle: "Fix login",
              taskId: "t1",
              commentId: null,
            },
          ],
        }),
      );

    renderSection();
    fireEvent.click(findButton());

    const apply = await screen.findByRole("button", {
      name: "settings:workspaceImport.jiraLinks.apply|count:1",
    });
    fireEvent.click(apply);

    await waitFor(() =>
      expect(m.mutateAsync).toHaveBeenLastCalledWith({
        workspaceId: "ws1",
        dryRun: false,
      }),
    );
  });

  it("shows the empty message when no Jira links were found", async () => {
    m.mutateAsync.mockResolvedValueOnce(report({}));

    renderSection();
    fireEvent.click(findButton());

    expect(
      await screen.findByText("settings:workspaceImport.jiraLinks.none"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "settings:workspaceImport.jiraLinks.apply|count:0",
      }),
    ).toBeDisabled();
  });
});
