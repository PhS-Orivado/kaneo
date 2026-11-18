import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import InstanceConfigSettingsPanel from "@/components/admin/instance-config-settings-panel";
import PageTitle from "@/components/page-title";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/settings/admin/instance-config",
)({
  component: RouteComponent,
});

function RouteComponent() {
  const { t } = useTranslation();

  return (
    <>
      <PageTitle title={t("settings:adminInstanceConfig.title")} />
      <InstanceConfigSettingsPanel />
    </>
  );
}
