import { client } from "@kaneo/libs";
import { HttpError } from "@/lib/http-error";

export type CreateRepositoryBranchRequest = {
  integrationId: string;
  taskId: string;
  branchName: string;
  create?: boolean;
};

export type CreateRepositoryBranchResponse = {
  integrationId: string;
  repositoryOwner: string;
  repositoryName: string;
  branchName: string;
  url: string;
  branchCreated: boolean;
  linkCreated: boolean;
};

async function createRepositoryBranch({
  integrationId,
  taskId,
  branchName,
  create = true,
}: CreateRepositoryBranchRequest) {
  const response =
    await client["github-integration"].integration[":integrationId"].branches.$post(
      {
        param: { integrationId },
        json: { taskId, branchName, create },
      },
    );

  if (!response.ok) {
    throw new HttpError(response.status, await response.text());
  }

  const data: CreateRepositoryBranchResponse = await response.json();
  return data;
}

export default createRepositoryBranch;
