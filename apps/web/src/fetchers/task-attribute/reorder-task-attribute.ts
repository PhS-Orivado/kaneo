import { client } from "@kaneo/libs";
import type { InferRequestType } from "hono/client";
import { HttpError } from "@/lib/http-error";

export type ReorderTaskAttributeRequest = InferRequestType<
  (typeof client)["taskAttribute"][":id"]["reorder"]["$post"]
>["json"] &
  InferRequestType<
    (typeof client)["taskAttribute"][":id"]["reorder"]["$post"]
  >["param"];

async function reorderTaskAttribute({
  id,
  position,
}: ReorderTaskAttributeRequest) {
  const response = await client.taskAttribute[":id"].reorder.$post({
    param: { id },
    json: { position },
  });

  if (!response.ok) {
    throw new HttpError(response.status, await response.text());
  }

  const data = await response.json();
  return data;
}

export default reorderTaskAttribute;
