import {
  getBoardCacheVersion,
  markBoardCacheChanged,
} from "@/lib/board-cache-version";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invalidateMyWork } from "@/lib/invalidate-my-work";
import type { SetTaskAttributeRequest } from "@/fetchers/task-attribute/set-task-attribute";
import setTaskAttribute from "@/fetchers/task-attribute/set-task-attribute";
import { updateBoardTaskCache } from "@/lib/update-board-task-cache";

type SetTaskAttributeVariables = SetTaskAttributeRequest & {
  projectId: string;
};

export function useSetTaskAttribute() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (task: SetTaskAttributeVariables) =>
      setTaskAttribute({ taskId: task.taskId, attributeId: task.attributeId }),
    onMutate: (task: SetTaskAttributeVariables) => {
      markBoardCacheChanged(queryClient, task.projectId, task.taskId);
      return {
        version: getBoardCacheVersion(queryClient, task.projectId, task.taskId),
      };
    },
    onSuccess: (updated, variables, context) => {
      invalidateMyWork(queryClient);
      queryClient.invalidateQueries({
        queryKey: ["task", variables.taskId],
      });
      updateBoardTaskCache(
        queryClient,
        variables.projectId,
        variables.taskId,
        { attribute: updated.attribute ?? null },
        context?.version,
      );
      queryClient.invalidateQueries({
        queryKey: ["activities", variables.taskId],
      });
    },
  });
}
