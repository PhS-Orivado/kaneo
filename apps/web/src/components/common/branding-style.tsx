import { useEffect } from "react";
import useGetConfig from "@/hooks/queries/config/use-get-config";

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

// Applies the configured accent color by overriding the --primary CSS
// variable. An inline style on the document element wins over the :root and
// .dark declarations in index.css for both themes.
export function BrandingStyle() {
  const { data: config } = useGetConfig();
  const accentColor = config?.branding?.accentColor;

  useEffect(() => {
    const root = document.documentElement;

    if (accentColor && HEX_COLOR.test(accentColor)) {
      root.style.setProperty("--primary", accentColor);
    } else {
      root.style.removeProperty("--primary");
    }

    return () => {
      root.style.removeProperty("--primary");
    };
  }, [accentColor]);

  return null;
}
