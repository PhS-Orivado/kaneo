import { client } from "@kaneo/libs";
import type { InferResponseType } from "hono/client";
import { HttpError } from "@/lib/http-error";
import { projectRepositoryBindingListSchema } from "@/types/repository-binding";

export type ListProjectRepositoryBindingsResponse = InferResponseType<
  (typeof client)["repository-bindings"]["project"][":projectId"]["$get"],
  200
>;

async function listProjectRepositoryBindings(projectId: string) {
  const response = await client["repository-bindings"].project[
    ":projectId"
  ].$get({ param: { projectId } });

  if (!response.ok) {
    throw new HttpError(response.status, await response.text());
  }

  const data: ListProjectRepositoryBindingsResponse = await response.json();
  return projectRepositoryBindingListSchema.parse(data);
}

export default listProjectRepositoryBindings;
