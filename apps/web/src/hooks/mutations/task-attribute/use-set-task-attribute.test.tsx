import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { useSetTaskAttribute } from "./use-set-task-attribute";

const mockInvalidateQueries = vi.fn();
const mockMarkBoardCacheChanged = vi.fn();
const mockGetBoardCacheVersion = vi.fn();
const mockInvalidateMyWork = vi.fn();
const mockUpdateBoardTaskCache = vi.fn();

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({
    invalidateQueries: mockInvalidateQueries,
  }),
  useMutation: (options: {
    mutationFn: (variables: unknown) => Promise<unknown>;
    onMutate?: (variables: unknown) => unknown;
    onSuccess?: (data: unknown, variables: unknown, context: unknown) => void;
  }) => {
    const mutateAsync = vi
      .fn()
      .mockImplementation(async (variables: Record<string, unknown>) => {
        const context = await options.onMutate?.(variables);
        const result = {
          id: variables.taskId,
          projectId: variables.projectId,
          attribute:
            variables.attributeId === null
              ? null
              : {
                  id: variables.attributeId,
                  name: "Bug",
                  icon: "bug",
                  iconColor: "red",
                  textColor: "white",
                },
        };
        await options.onSuccess?.(result, variables, context);
        return result;
      });

    return {
      mutateAsync,
      isPending: false,
    };
  },
}));

vi.mock("@/lib/board-cache-version", () => ({
  markBoardCacheChanged: mockMarkBoardCacheChanged,
  getBoardCacheVersion: mockGetBoardCacheVersion,
}));

vi.mock("@/lib/invalidate-my-work", () => ({
  invalidateMyWork: mockInvalidateMyWork,
}));

vi.mock("@/lib/update-board-task-cache", () => ({
  updateBoardTaskCache: mockUpdateBoardCache,
}));

vi.mock("@/fetchers/task-attribute/set-task-attribute", () => ({
  default: vi.fn(),
}));

describe("useSetTaskAttribute", () => {
  beforeEach(() => {
    mockInvalidateQueries.mockClear();
    mockMarkBoardCacheChanged.mockClear();
    mockInvalidateMyWork.mockClear();
    mockUpdateBoardCache.mockClear();
    mockGetBoardCacheVersion.mockReturnValue("version-1");
  });

  it("patches the board cache with the returned attribute and invalidates the task", async () => {
    const { result } = renderHook(() => useSetTaskAttribute());

    await result.current.mutateAsync({
      taskId: "task-1",
      projectId: "project-1",
      attributeId: "attribute-bug",
    });

    expect(mockMarkBoardCacheChanged).toHaveBeenCalledWith(
      undefined,
      "project-1",
      "task-1",
    );
    expect(mockUpdateBoardTaskCache).toHaveBeenCalledWith(
      undefined,
      "project-1",
      "task-1",
      {
        attribute: {
          id: "attribute-bug",
          name: "Bug",
          icon: "bug",
          iconColor: "red",
          textColor: "white",
        },
      },
      "version-1",
    );
    expect(mockInvalidateMyWork).toHaveBeenCalledWith(undefined);
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ["task", "task-1"],
    });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ["activities", "task-1"],
    });
  });

  it("clears the attribute in the board cache when null is set", async () => {
    const { result } = renderHook(() => useSetTaskAttribute());

    await result.current.mutateAsync({
      taskId: "task-1",
      projectId: "project-1",
      attributeId: null,
    });

    expect(mockUpdateBoardTaskCache).toHaveBeenCalledWith(
      undefined,
      "project-1",
      "task-1",
      { attribute: null },
      "version-1",
    );
  });
});
