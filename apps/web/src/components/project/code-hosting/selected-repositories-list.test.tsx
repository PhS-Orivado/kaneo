import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { SelectedRepositoriesList } from "./selected-repositories-list";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

afterEach(() => {
  cleanup();
});

describe("SelectedRepositoriesList", () => {
  it("renders one removable row per repository", () => {
    const onRemove = vi.fn();
    render(
      <SelectedRepositoriesList
        repositories={["owner/alpha", "owner/beta"]}
        onRemove={onRemove}
      />,
    );
    expect(screen.getByText("owner/alpha")).toBeInTheDocument();
    expect(screen.getByText("owner/beta")).toBeInTheDocument();
    expect(
      screen.getByRole("list", {
        name: "settings:codeHosting.selectedRepositories",
      }),
    ).toBeInTheDocument();
  });

  it("reports the repository matching the clicked remove button", () => {
    const onRemove = vi.fn();
    render(
      <SelectedRepositoriesList
        repositories={["owner/alpha", "owner/beta"]}
        onRemove={onRemove}
      />,
    );
    const removeButtons = screen.getAllByRole("button");
    expect(removeButtons).toHaveLength(2);
    fireEvent.click(removeButtons[1] as HTMLElement);
    expect(onRemove).toHaveBeenCalledWith("owner/beta");
  });

  it("renders nothing when the selection is empty", () => {
    const { container } = render(
      <SelectedRepositoriesList repositories={[]} onRemove={vi.fn()} />,
    );
    expect(container.querySelector("ul")).toBeNull();
  });
});
