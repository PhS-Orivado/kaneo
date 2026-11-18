import { client } from "@kaneo/libs";
import type { InferResponseType } from "hono/client";
import { HttpError } from "@/lib/http-error";

export type InstanceConfig = InferResponseType<
  (typeof client)["admin"]["instance-config"]["$get"],
  200
>;

export async function getInstanceConfig(): Promise<InstanceConfig> {
  const response = await client.admin["instance-config"].$get();

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  return response.json();
}
