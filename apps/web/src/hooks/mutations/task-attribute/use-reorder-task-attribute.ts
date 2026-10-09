import { useMutation, useQueryClient } from "@tanstack/react-query";
import reorderTaskAttribute from "@/fetchers/task-attribute/reorder-task-attribute";

function useReorderTaskAttribute() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: reorderTaskAttribute,
    onSuccess: (updatedAttribute) => {
      // Reordering shifts the positions of the other attributes in the
      // workspace as well, so the whole list is refetched.
      void queryClient.invalidateQueries({
        queryKey: ["task-attributes", updatedAttribute.workspaceId],
      });
    },
  });
}

export default useReorderTaskAttribute;
