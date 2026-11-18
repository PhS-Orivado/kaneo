import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";
import type { InferRequestType } from "hono/client";
import type { InstanceConfig } from "./get-instance-config";

export type UpdateInstanceConfigInput = InferRequestType<
  (typeof client)["admin"]["instance-config"]["$put"]
>["json"];

export async function updateInstanceConfig(
  config: UpdateInstanceConfigInput,
): Promise<InstanceConfig> {
  const response = await client.admin["instance-config"].$put({
    json: config,
  });

  if (!response.ok) {
    throw await HttpError.fromResponse(response);
  }

  return response.json();
}
