import { useEffect } from "react";
import useGetConfig from "@/hooks/queries/config/use-get-config";

type PageTitleProps = {
  title: string;
  suffix?: string;
  hideAppName?: boolean;
};

export default function PageTitle({
  title,
  suffix,
  hideAppName = false,
}: PageTitleProps) {
  const { data: config } = useGetConfig();
  const resolvedSuffix = suffix ?? config?.branding?.appName ?? "Kaneo";

  useEffect(() => {
    const formattedTitle = hideAppName
      ? title
      : resolvedSuffix
        ? `${title} · ${resolvedSuffix}`
        : title;
    document.title = formattedTitle;
  }, [title, resolvedSuffix, hideAppName]);

  return null;
}
