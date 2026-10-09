import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";

export type SetTaskAttributeRequest = {
  taskId: string;
  attributeId: string | null;
};

async function setTaskAttribute({
  taskId,
  attributeId,
}: SetTaskAttributeRequest) {
  const response = await client.task.attribute[":id"].$put({
    param: { id: taskId },
    json: { attributeId },
  });

  if (!response.ok) {
    throw new HttpError(response.status, await response.text());
  }

  const data = await response.json();
  return data;
}

export default setTaskAttribute;
