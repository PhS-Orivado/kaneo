import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { Button } from "@/components/ui/button";
import type Task from "@/types/task";
import TaskAttributePopover from "./task-attribute-popover";

const useGetTaskAttributes = vi.fn();
const useActiveWorkspace = vi.fn();
const setTaskAttribute = vi.fn();
let canUpdateTasks = true;

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
  canUpdateTasks = true;
});

vi.mock("@/hooks/queries/task-attribute/use-get-task-attributes", () => ({
  default: (workspaceId: string) => useGetTaskAttributes(workspaceId),
}));

vi.mock("@/hooks/mutations/task-attribute/use-set-task-attribute", () => ({
  useSetTaskAttribute: () => ({ mutateAsync: setTaskAttribute }),
}));

vi.mock("@/hooks/queries/workspace/use-active-workspace", () => ({
  default: () => useActiveWorkspace(),
}));

vi.mock("@/hooks/use-workspace-permission", () => ({
  useWorkspacePermission: () => ({ canUpdateTasks: () => canUpdateTasks }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      (options?.defaultValue as string | undefined) ?? key,
  }),
}));

const task: Task = {
  id: "task-1",
  title: "Directly loaded task",
  number: 1,
  description: null,
  status: "to-do",
  priority: null,
  startDate: null,
  dueDate: null,
  position: 1,
  createdAt: "2026-07-17T00:00:00.000Z",
  userId: null,
  assigneeId: null,
  assigneeName: null,
  projectId: "project-1",
  attribute: {
    id: "attribute-1",
    name: "Task",
    icon: "SquareCheckBig",
    iconColor: "slate",
    textColor: "slate",
  },
};

function makeAttribute(id: string, name: string) {
  return {
    id,
    name,
    workspaceId: "workspace-1",
    description: null,
    position: 0,
    isDefault: false,
    createdAt: "2026-07-17T00:00:00.000Z",
    updatedAt: "2026-07-17T00:00:00.000Z",
    icon: "Bug",
    iconColor: "red",
    textColor: "red",
  };
}

describe("TaskAttributePopover", () => {
  it("lists the workspace attributes with a None option and assigns on select", async () => {
    useActiveWorkspace.mockReturnValue({ data: { id: "workspace-1" } });
    useGetTaskAttributes.mockReturnValue({
      data: [
        makeAttribute("attribute-1", "Task"),
        makeAttribute("attribute-2", "Bug"),
      ],
      isLoading: false,
      isError: false,
    });
    setTaskAttribute.mockResolvedValue({});

    render(
      <TaskAttributePopover task={task}>
        <Button>Attribute</Button>
      </TaskAttributePopover>,
    );

    expect(useGetTaskAttributes).toHaveBeenCalledWith("workspace-1");

    fireEvent.click(screen.getByRole("button", { name: "Attribute" }));

    expect(await screen.findByRole("button", { name: /Bug/ })).toBeVisible();
    expect(screen.getByRole("button", { name: /^None$/ })).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: /Bug/ }));

    await vi.waitFor(() => {
      expect(setTaskAttribute).toHaveBeenCalledWith({
        taskId: "task-1",
        attributeId: "attribute-2",
        projectId: "project-1",
      });
    });
  });

  it("renders the trigger as a plain element without a popover for read-only roles", () => {
    canUpdateTasks = false;

    useActiveWorkspace.mockReturnValue({ data: { id: "workspace-1" } });
    useGetTaskAttributes.mockReturnValue({
      data: [makeAttribute("attribute-1", "Task")],
      isLoading: false,
      isError: false,
    });

    render(
      <TaskAttributePopover task={task}>
        <Button>Attribute</Button>
      </TaskAttributePopover>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Attribute" }));

    expect(screen.queryByRole("button", { name: /Task/ })).toBeNull();
  });

  it("offers a search field above eight attributes and filters the list", async () => {
    useActiveWorkspace.mockReturnValue({ data: { id: "workspace-1" } });
    const attributes = Array.from({ length: 9 }, (_, index) =>
      makeAttribute(`attribute-${index + 1}`, `Attribute ${index + 1}`),
    );
    useGetTaskAttributes.mockReturnValue({
      data: attributes,
      isLoading: false,
      isError: false,
    });

    render(
      <TaskAttributePopover task={task}>
        <Button>Attribute</Button>
      </TaskAttributePopover>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Attribute" }));

    const searchInput = await screen.findByPlaceholderText("Search attributes");
    expect(screen.getByRole("button", { name: /Attribute 9/ })).toBeVisible();

    fireEvent.change(searchInput, { target: { value: "9" } });

    expect(screen.queryByRole("button", { name: /Attribute 1$/ })).toBeNull();
    expect(screen.getByRole("button", { name: /Attribute 9/ })).toBeVisible();
  });
});
