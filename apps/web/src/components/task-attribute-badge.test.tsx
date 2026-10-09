import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";
import { TaskAttributeBadge } from "./task-attribute-badge";

const attribute = {
  id: "attribute-1",
  name: "Bug",
  icon: "Bug",
  iconColor: "red",
  textColor: "red",
};

describe("TaskAttributeBadge", () => {
  it("renders the symbol and name with resolved palette colors", () => {
    render(<TaskAttributeBadge attribute={attribute} />);
    const badge = screen.getByTitle("Bug");
    expect(badge).toHaveTextContent("Bug");
    expect(badge).toHaveStyle({ color: "var(--color-red-600)" });
    const icon = badge.querySelector("svg");
    expect(icon).toHaveStyle({ color: "var(--color-red-600)" });
  });

  it("falls back to a default symbol for unknown icons", () => {
    render(
      <TaskAttributeBadge
        attribute={{ ...attribute, icon: "NotAnIcon" }}
      />,
    );
    expect(screen.getByTitle("Bug").querySelector("svg")).toBeInTheDocument();
  });

  it("renders nothing without an attribute", () => {
    const { container } = render(<TaskAttributeBadge attribute={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
