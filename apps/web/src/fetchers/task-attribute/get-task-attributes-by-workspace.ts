import { client } from "@kaneo/libs";
import type { InferRequestType } from "hono/client";
import { HttpError } from "@/lib/http-error";

export type GetTaskAttributesByWorkspaceRequest = InferRequestType<
  (typeof client)["taskAttribute"]["workspace"][":workspaceId"]["$get"]
>["param"];

async function getTaskAttributesByWorkspace({
  workspaceId,
}: GetTaskAttributesByWorkspaceRequest) {
  const response = await client.taskAttribute.workspace[":workspaceId"].$get({
    param: {
      workspaceId,
    },
  });

  if (!response.ok) {
    throw new HttpError(response.status, await response.text());
  }

  const data = await response.json();
  return data;
}

export default getTaskAttributesByWorkspace;
