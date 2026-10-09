import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { CreateTaskAttributeRequest } from "@/fetchers/task-attribute/create-task-attribute";
import createTaskAttribute from "@/fetchers/task-attribute/create-task-attribute";
import { compareTaskAttributes } from "@/lib/task-attribute";

function useCreateTaskAttribute() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createTaskAttribute,
    onSuccess: (createdAttribute, variables: CreateTaskAttributeRequest) => {
      queryClient.setQueryData(
        ["task-attributes", variables.workspaceId],
        (existingAttributes: Array<typeof createdAttribute> | undefined) => {
          if (!existingAttributes) return [createdAttribute];

          const alreadyExists = existingAttributes.some(
            (attribute) => attribute.id === createdAttribute.id,
          );

          return alreadyExists
            ? existingAttributes
            : [...existingAttributes, createdAttribute].sort((a, b) =>
                compareTaskAttributes(a, b),
              );
        },
      );

      void queryClient.invalidateQueries({
        queryKey: ["task-attributes", variables.workspaceId],
      });
    },
  });
}

export default useCreateTaskAttribute;
