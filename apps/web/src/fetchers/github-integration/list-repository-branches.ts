import { client } from "@kaneo/libs";
import type { InferResponseType } from "hono/client";
import { HttpError } from "@/lib/http-error";

export type ListRepositoryBranchesResponse = InferResponseType<
  (typeof client)["github-integration"]["integration"][":integrationId"]["branches"]["$get"],
  200
>;

export type RepositoryBranch = {
  name: string;
  commitSha: string | null;
};

export type RepositoryBranchList = {
  branches: RepositoryBranch[];
  hasMore: boolean;
};

async function listRepositoryBranches(
  integrationId: string,
  query?: string,
): Promise<RepositoryBranchList> {
  const response = await client["github-integration"].integration[
    ":integrationId"
  ].branches.$get({
    param: { integrationId },
    ...(query ? { query: { query } } : {}),
  });

  if (!response.ok) {
    throw new HttpError(response.status, await response.text());
  }

  const data: ListRepositoryBranchesResponse = await response.json();
  return {
    branches: data.branches.map((branch) => ({
      name: branch.name,
      commitSha: branch.commitSha,
    })),
    hasMore: data.hasMore,
  };
}

export default listRepositoryBranches;
