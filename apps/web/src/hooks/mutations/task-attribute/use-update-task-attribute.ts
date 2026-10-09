import { useMutation, useQueryClient } from "@tanstack/react-query";
import updateTaskAttribute from "@/fetchers/task-attribute/update-task-attribute";

function useUpdateTaskAttribute() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateTaskAttribute,
    onSuccess: (updatedAttribute) => {
      void queryClient.invalidateQueries({
        queryKey: ["task-attributes", updatedAttribute.workspaceId],
      });
      // Attribute name, symbol and colors are embedded in task payloads,
      // so every task cache that renders badges must be refreshed.
      void queryClient.invalidateQueries({
        queryKey: ["tasks"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["task"],
      });
    },
  });
}

export default useUpdateTaskAttribute;
