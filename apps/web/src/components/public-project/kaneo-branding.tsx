import { useTranslation } from "react-i18next";
import useGetConfig from "@/hooks/queries/config/use-get-config";

export function KaneoBranding() {
  const { t } = useTranslation();
  const { data: config } = useGetConfig();
  const branding = config?.branding;

  if (branding && !branding.showPoweredBy) {
    return null;
  }

  const href = branding?.footerUrl ?? "https://kaneo.app";
  const customText = branding?.footerText?.trim() || null;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="hover:text-foreground transition-colors"
    >
      {customText ?? (
        <>
          {t("publicProject:branding.poweredBy")}{" "}
          <span className="font-medium">
            {branding?.appName ?? t("common:appName")}
          </span>
        </>
      )}
    </a>
  );
}
