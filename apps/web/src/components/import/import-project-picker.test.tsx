import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { ImportProjectPicker } from "@/components/import/import-project-picker";
import { getImportSource } from "@/components/import/import-source-definitions";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { count?: number }) =>
      options?.count === undefined ? key : `${key}:${options.count}`,
  }),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    target,
    rel,
    className,
  }: {
    children?: ReactNode;
    to: string;
    target?: string;
    rel?: string;
    className?: string;
  }) => (
    <a href={to} target={target} rel={rel} className={className}>
      {children}
    </a>
  ),
}));

afterEach(cleanup);

const projects = [
  { id: "eng", name: "Engineering", detail: "ENG · 412 issues" },
  { id: "des", name: "Design" },
];

function renderPicker(onStart = vi.fn()) {
  render(
    <ImportProjectPicker
      source={getImportSource("linear")}
      workspaceId="ws1"
      workspaceName="Acme"
      projects={projects}
      error={null}
      isStarting={false}
      onBack={vi.fn()}
      onStart={onStart}
    />,
  );
  return onStart;
}

const importButton = (count: number) =>
  screen.getByRole("button", {
    name: `settings:workspaceImport.units.team.importButton:${count}`,
  });

describe("ImportProjectPicker", () => {
  it("starts with nothing picked and the import button disabled", () => {
    renderPicker();

    expect(importButton(0)).toBeDisabled();
    expect(screen.getByText("ENG · 412 issues")).toBeInTheDocument();
  });

  it("imports the picked teams with comments by default", () => {
    const onStart = renderPicker();

    fireEvent.click(screen.getByText("Engineering"));
    fireEvent.click(importButton(1));

    expect(onStart).toHaveBeenCalledWith({
      projectIds: ["eng"],
      includeComments: true,
      includeSprints: true,
      userHandling: "invite",
    });
  });

  it("does not offer the sprint switch for sources without sprints", () => {
    renderPicker();

    expect(
      screen.queryByRole("switch", {
        name: "settings:workspaceImport.select.sprintsLabel",
      }),
    ).not.toBeInTheDocument();
  });

  it("lets the user opt out of sprints for Jira", () => {
    const onStartJira = vi.fn();
    render(
      <ImportProjectPicker
        source={getImportSource("jira")}
        workspaceId="ws1"
        workspaceName="Acme"
        projects={projects}
        error={null}
        isStarting={false}
        onBack={vi.fn()}
        onStart={onStartJira}
      />,
    );

    fireEvent.click(screen.getByText("Engineering"));
    fireEvent.click(
      screen.getByRole("switch", {
        name: "settings:workspaceImport.select.sprintsLabel",
      }),
    );
    fireEvent.click(importButton(1));

    expect(onStartJira).toHaveBeenCalledWith({
      projectIds: ["eng"],
      includeComments: true,
      includeSprints: false,
      userHandling: "invite",
    });
  });

  it("lets the user create accounts instead of sending invitations", () => {
    const onStart = renderPicker();

    fireEvent.click(screen.getByText("Engineering"));
    fireEvent.click(
      screen.getByRole("radio", {
        name: "settings:workspaceImport.select.usersCreateLabel",
      }),
    );
    fireEvent.click(importButton(1));

    expect(onStart).toHaveBeenCalledWith({
      projectIds: ["eng"],
      includeComments: true,
      includeSprints: true,
      userHandling: "create",
    });
  });

  it("selects and clears every team", () => {
    const onStart = renderPicker();

    fireEvent.click(
      screen.getByRole("button", {
        name: "settings:workspaceImport.select.selectAll",
      }),
    );
    fireEvent.click(
      screen.getByRole("switch", {
        name: "settings:workspaceImport.select.commentsLabel",
      }),
    );
    fireEvent.click(importButton(2));
    expect(onStart).toHaveBeenCalledWith({
      projectIds: ["eng", "des"],
      includeComments: false,
      includeSprints: true,
      userHandling: "invite",
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: "settings:workspaceImport.select.clear",
      }),
    );
    expect(importButton(0)).toBeDisabled();
  });

  it("links to the members page in a new tab", () => {
    renderPicker();

    const invite = screen.getByRole("link", {
      name: /settings:workspaceImport\.select\.inviteMembers/,
    });
    expect(invite).toHaveAttribute(
      "href",
      "/dashboard/workspace/$workspaceId/members",
    );
    expect(invite).toHaveAttribute("target", "_blank");
  });
});
