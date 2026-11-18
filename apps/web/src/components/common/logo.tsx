import { Link } from "@tanstack/react-router";
import useProjectStore from "@/store/project";

type LogoProps = {
  className?: string;
};

export function Logo({ className = "" }: LogoProps) {
  const { setProject } = useProjectStore();
  const { data: config } = useGetConfig();
  const branding = config?.branding;
  const lightThemeLogo = branding?.logoLightUrl ?? "/logo-dark.svg";
  const darkThemeLogo = branding?.logoDarkUrl ?? "/logo-light.svg";
  const appName = branding?.appName ?? "Kaneo";

  return (
    <Link
      onClick={() => {
        setProject(undefined);
      }}
      to="/dashboard"
      className={`w-auto ${className}`}
    >
      <img
        src="/logo-dark.svg"
        alt="Kaneo"
        className="h-6 w-auto dark:hidden"
      />
      <img
        src="/logo-light.svg"
        alt="Kaneo"
        className="hidden h-6 w-auto dark:block"
      />
    </Link>
  );
}
