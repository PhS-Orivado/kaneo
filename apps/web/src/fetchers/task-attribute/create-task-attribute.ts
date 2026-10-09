import { client } from "@kaneo/libs";
import type { InferRequestType } from "hono/client";
import { HttpError } from "@/lib/http-error";

export type CreateTaskAttributeRequest = InferRequestType<
  (typeof client)["taskAttribute"]["$post"]
>["json"];

async function createTaskAttribute({
  workspaceId,
  name,
  description,
  icon,
  iconColor,
  textColor,
  isDefault,
}: CreateTaskAttributeRequest) {
  const response = await client.taskAttribute.$post({
    json: {
      workspaceId,
      name,
      description,
      icon,
      iconColor,
      textColor,
      isDefault,
    },
  });

  if (!response.ok) {
    throw new HttpError(response.status, await response.text());
  }

  const data = await response.json();
  return data;
}

export default createTaskAttribute;
