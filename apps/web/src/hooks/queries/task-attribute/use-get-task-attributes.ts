import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import getTaskAttributesByWorkspace from "@/fetchers/task-attribute/get-task-attributes-by-workspace";
import { compareTaskAttributes } from "@/lib/task-attribute";

function useGetTaskAttributes(workspaceId: string) {
  const { i18n } = useTranslation();
  const locale = i18n.resolvedLanguage || i18n.language;

  return useQuery({
    enabled: Boolean(workspaceId),
    queryKey: ["task-attributes", workspaceId],
    queryFn: () => getTaskAttributesByWorkspace({ workspaceId }),
    select: (attributes) =>
      [...attributes].sort((a, b) => compareTaskAttributes(a, b, locale)),
  });
}

export default useGetTaskAttributes;
