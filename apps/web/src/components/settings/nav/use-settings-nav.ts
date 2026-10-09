import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { buildSettingsNav } from "@/components/settings/nav/build-settings-nav";
import useAdminAccess from "@/hooks/queries/admin/use-admin-access";
import useGetConfig from "@/hooks/queries/config/use-get-config";
import useGetProjects from "@/hooks/queries/project/use-get-projects";
import useActiveWorkspace from "@/hooks/queries/workspace/use-active-workspace";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";

export function useSettingsNav() {
  const { t } = useTranslation();
  const { data: workspace } = useActiveWorkspace();
  const { data: projects } = useGetProjects({
    workspaceId: workspace?.id ?? "",
  });
  const { data: config } = useGetConfig();
  const { data: hasAdminAccess } = useAdminAccess();
  const { canUpdateTaskAttributes, isCheckingPermissions } =
    useWorkspacePermission();

  return useMemo(
    () =>
      buildSettingsNav({
        t,
        workspaceName: workspace?.name,
        billingEnabled: Boolean(config?.billingEnabled),
        hasAdminAccess: Boolean(hasAdminAccess),
        hasTaskAttributeAccess:
          canUpdateTaskAttributes() && !isCheckingPermissions,
        projects: projects ?? [],
      }),
    [
      t,
      workspace?.name,
      config?.billingEnabled,
      hasAdminAccess,
      canUpdateTaskAttributes,
      isCheckingPermissions,
      projects,
    ],
  );
}
