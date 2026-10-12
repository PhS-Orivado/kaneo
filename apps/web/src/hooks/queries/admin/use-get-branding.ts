import { useQuery } from "@tanstack/react-query";
import { getBranding } from "@/fetchers/admin/get-branding";

export const ADMIN_BRANDING_QUERY_KEY = ["admin", "branding"] as const;

function useGetBranding() {
  return useQuery({
    queryKey: ADMIN_BRANDING_QUERY_KEY,
    queryFn: getBranding,
  });
}

export default useGetBranding;
