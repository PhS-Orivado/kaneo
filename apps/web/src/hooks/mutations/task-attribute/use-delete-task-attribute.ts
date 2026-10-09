import { useMutation, useQueryClient } from "@tanstack/react-query";
import deleteTaskAttribute from "@/fetchers/task-attribute/delete-task-attribute";

function useDeleteTaskAttribute() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteTaskAttribute,
    onSuccess: (deletedAttribute) => {
      void queryClient.invalidateQueries({
        queryKey: ["task-attributes", deletedAttribute.workspaceId],
      });
      // A forced deletion reassigns tasks to the workspace default, so the
      // task caches must be refreshed alongside the attribute list.
      void queryClient.invalidateQueries({
        queryKey: ["tasks"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["task"],
      });
    },
  });
}

export default useDeleteTaskAttribute;
