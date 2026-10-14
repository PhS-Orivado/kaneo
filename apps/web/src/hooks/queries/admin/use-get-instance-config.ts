import { queryOptions, useQuery } from "@tanstack/react-query";
import { getInstanceConfig } from "@/fetchers/admin/get-instance-config";

export const ADMIN_INSTANCE_CONFIG_QUERY_KEY = [
  "admin",
  "instance-config",
] as const;

export function adminInstanceConfigQueryOptions() {
  return queryOptions({
    queryKey: ADMIN_INSTANCE_CONFIG_QUERY_KEY,
    queryFn: getInstanceConfig,
  });
}

function useGetInstanceConfig() {
  return useQuery(adminInstanceConfigQueryOptions());
}

export default useGetInstanceConfig;
