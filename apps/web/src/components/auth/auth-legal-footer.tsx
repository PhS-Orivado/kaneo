import { useTranslation } from "react-i18next";
import useGetConfig from "@/hooks/queries/config/use-get-config";

const linkClassName = "transition-colors hover:text-foreground";

function linkLabel(fallback: string, href: string, label: string | null) {
  if (label && label.trim().length > 0) {
    return label;
  }
  return fallback;
}

function hostname(href: string) {
  try {
    return new URL(href).hostname;
  } catch {
    return href;
  }
}

export function AuthLegalFooter() {
  const { t } = useTranslation();
  const { data: config } = useGetConfig();
  const branding = config?.branding;

  const termsHref = branding?.termsUrl ?? "https://kaneo.app/terms";
  const privacyHref = branding?.privacyUrl ?? "https://kaneo.app/privacy";
  const hasCustomLinks = Boolean(branding?.termsUrl || branding?.privacyUrl);

  // Cloud instances keep the legal footer; self-hosted instances only show it
  // once white-label links have been configured.
  if (!config?.isCloud && !hasCustomLinks) return null;

  const siteLink = branding?.footerUrl
    ? {
        href: branding.footerUrl,
        label: linkLabel(hostname(branding.footerUrl), branding.footerUrl, branding.footerText),
      }
    : branding?.showPoweredBy === false
      ? null
      : { href: "https://kaneo.app", label: "kaneo.app" };

  return (
    <footer className="flex justify-center gap-5 px-6 pb-8 text-muted-foreground text-xs">
      <a href={termsHref} target="_blank" rel="noopener noreferrer" className={linkClassName}>
        {t("auth:page.terms")}
      </a>
      <a href={privacyHref} target="_blank" rel="noopener noreferrer" className={linkClassName}>
        {t("auth:page.privacy")}
      </a>
      {siteLink ? (
        <a
          href={siteLink.href}
          target="_blank"
          rel="noopener noreferrer"
          className={linkClassName}
        >
          {siteLink.label}
        </a>
      ) : null}
    </footer>
  );
}
