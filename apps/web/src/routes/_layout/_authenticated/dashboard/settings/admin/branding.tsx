import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import BrandingSettingsPanel from "@/components/admin/branding-settings-panel";
import PageTitle from "@/components/page-title";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/settings/admin/branding",
)({
  component: RouteComponent,
});

function RouteComponent() {
  const { t } = useTranslation();

  return (
    <>
      <PageTitle title={t("settings:adminBranding.title")} />
      <BrandingSettingsPanel />
    </>
  );
}
