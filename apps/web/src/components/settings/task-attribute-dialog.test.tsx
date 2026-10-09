import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { TaskAttributeDialog } from "./task-attribute-dialog";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) =>
      options?.defaultValue ?? key,
  }),
}));

const onOpenChange = vi.fn();

function renderDialog(props: Record<string, unknown> = {}) {
  const onSubmit = vi.fn();
  render(
    <TaskAttributeDialog
      open
      onOpenChange={onOpenChange}
      mode="create"
      isPending={false}
      onSubmit={onSubmit}
      {...props}
    />,
  );
  return onSubmit;
}

beforeEach(() => {
  onOpenChange.mockClear();
});

describe("TaskAttributeDialog", () => {
  it("blocks submission and reports the required error for an empty name", () => {
    const onSubmit = renderDialog();

    fireEvent.click(
      screen.getByRole("button", { name: "Create Task Attribute" }),
    );

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText("Attribute name is required")).toBeInTheDocument();
  });

  it("submits the trimmed draft once the name is valid", () => {
    const onSubmit = renderDialog();

    fireEvent.change(screen.getByLabelText("Attribute name"), {
      target: { value: "  Bug  " },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Create Task Attribute" }),
    );

    expect(onSubmit).toHaveBeenCalledWith({
      name: "Bug",
      description: "",
      icon: "SquareCheckBig",
      iconColor: "slate",
      textColor: "slate",
      isDefault: false,
    });
  });

  it("lets the picker selections flow into the submitted draft", () => {
    const onSubmit = renderDialog();

    fireEvent.change(screen.getByLabelText("Attribute name"), {
      target: { value: "Bug" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Bug" }));
    fireEvent.click(
      within(screen.getByRole("group", { name: "Symbol color" })).getByRole(
        "button",
        { name: "Crimson" },
      ),
    );
    fireEvent.click(
      within(screen.getByRole("group", { name: "Font color" })).getByRole(
        "button",
        { name: "Crimson" },
      ),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Create Task Attribute" }),
    );

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Bug",
        icon: "Bug",
        iconColor: "red",
        textColor: "red",
      }),
    );
  });

  it("preselects the current values and locks the default toggle in edit mode", () => {
    const onSubmit = renderDialog({
      mode: "edit",
      isCurrentDefault: true,
      initial: {
        name: "Task",
        description: "The default type",
        icon: "SquareCheckBig",
        iconColor: "slate",
        textColor: "slate",
        isDefault: true,
      },
    });

    const nameInput = screen.getByLabelText("Attribute name");
    expect(nameInput).toHaveValue("Task");

    const defaultToggle = screen.getByRole("switch");
    expect(defaultToggle).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Task",
        description: "The default type",
        isDefault: true,
      }),
    );
  });
});
