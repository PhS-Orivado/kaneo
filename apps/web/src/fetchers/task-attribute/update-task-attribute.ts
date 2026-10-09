import { client } from "@kaneo/libs";
import type { InferRequestType } from "hono/client";
import { HttpError } from "@/lib/http-error";

export type UpdateTaskAttributeRequest = InferRequestType<
  (typeof client)["taskAttribute"][":id"]["$put"]
>["json"] &
  InferRequestType<(typeof client)["taskAttribute"][":id"]["$put"]>["param"];

async function updateTaskAttribute({
  id,
  name,
  description,
  icon,
  iconColor,
  textColor,
  isDefault,
}: UpdateTaskAttributeRequest) {
  const response = await client.taskAttribute[":id"].$put({
    param: { id },
    json: {
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

export default updateTaskAttribute;
