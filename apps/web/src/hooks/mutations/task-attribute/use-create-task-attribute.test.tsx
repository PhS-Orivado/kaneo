import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import useCreateTaskAttribute from "./use-create-task-attribute";

const mockSetQueryData = vi.fn();
const mockInvalidateQueries = vi.fn();

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({
    setQueryData: mockSetQueryData,
    invalidateQueries: mockInvalidateQueries,
  }),
  useMutation: (options: {
    onSuccess?: (data: unknown, variables: unknown) => void;
  }) => {
    const mutateAsync = vi
      .fn()
      .mockImplementation(async (variables: Record<string, unknown>) => {
        const result = {
          id: "attribute-new",
          workspaceId: variables.workspaceId,
          name: variables.name,
          description: null,
          icon: variables.icon,
          iconColor: variables.iconColor,
          textColor: variables.textColor,
          position: 1,
          isDefault: false,
          createdAt: "2026-10-09T08:00:00Z",
          updatedAt: "2026-10-09T08:00:00Z",
        };
        await options.onSuccess?.(result, variables);
        return result;
      });

    return {
      mutateAsync,
      isPending: false,
    };
  },
}));

vi.mock("@/fetchers/task-attribute/create-task-attribute", () => ({
  default: vi.fn(),
}));

describe("useCreateTaskAttribute", () => {
  beforeEach(() => {
    mockSetQueryData.mockClear();
    mockInvalidateQueries.mockClear();
  });

  it("appends the created attribute to the workspace cache in position order", async () => {
    const { result } = renderHook(() => useCreateTaskAttribute());

    await result.current.mutateAsync({
      workspaceId: "workspace-1",
      name: "Doc",
      icon: "file",
      iconColor: "base",
      textColor: "base",
    });

    expect(mockSetQueryData).toHaveBeenCalledTimes(1);
    const [queryKey, updater] = mockSetQueryData.mock.calls[0];
    expect(queryKey).toEqual(["task-attributes", "workspace-1"]);
    expect(
      updater([
        { id: "attribute-1", name: "Task", position: 0 },
        { id: "attribute-2", name: "Bug", position: 5 },
      ]).map((attribute: { id: string }) => attribute.id),
    ).toEqual(["attribute-1", "attribute-new", "attribute-2"]);

    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ["task-attributes", "workspace-1"],
    });
  });

  it("keeps the existing cache when the attribute is already present", async () => {
    const { result } = renderHook(() => useCreateTaskAttribute());

    await result.current.mutateAsync({
      workspaceId: "workspace-1",
      name: "Doc",
      icon: "file",
      iconColor: "base",
      textColor: "base",
    });

    const [, updater] = mockSetQueryData.mock.calls[0];
    expect(
      updater([{ id: "attribute-new", name: "Doc", position: 0 }]),
    ).toEqual([{ id: "attribute-new", name: "Doc", position: 0 }]);
  });
});
