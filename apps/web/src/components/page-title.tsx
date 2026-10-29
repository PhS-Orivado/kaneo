import useGetConfig from "@/hooks/queries/config/use-get-config";
import { useInstanceNameStore } from "@/store/instance-name";

type PageTitleProps = {
  title?: string;
  suffix?: string;
  hideAppName?: boolean;
};

export default function PageTitle({
  title,
  suffix,
  hideAppName = false,
}: PageTitleProps) {
  const instanceName = useInstanceNameStore((state) => state.instanceName);
  const { data: config } = useGetConfig();
  if (!title) return null;

  const appName = suffix ?? config?.branding?.appName;
  const formattedTitle = hideAppName
    ? title
    : appName
      ? `${title} · ${appName}`
      : instanceName === "Kaneo"
        ? title
        : `${title} | ${instanceName}`;

  return <title>{formattedTitle}</title>;
}
