import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import type { Octokit } from "octokit";
import db from "../../database";
import { taskTable } from "../../database/schema";
import { publishEvent } from "../../events";
import { createOrUpdateExternalLink } from "../../plugins/github/services/link-manager";
import { isValidBranchName } from "../../plugins/github/utils/branch-matcher";
import { resolveVerifiedIntegration } from "./resolve-verified-integration";

/**
 * GitHub API ref endpoints reject literal slashes in the path, so percent
 * encode them. The first attempt uses the plain name for repos whose branch
 * names never needed it, keeping the happy path in one request.
 */
async function findBranchHead(
  octokit: Octokit,
  owner: string,
  repo: string,
  branchName: string,
): Promise<string | null> {
  try {
    const { data } = await octokit.rest.repos.getBranch({
      owner,
      repo,
      branch: branchName,
    });
    return data.commit.sha;
  } catch {
    try {
      const { data } = await octokit.rest.repos.getBranch({
        owner,
        repo,
        branch: encodeURIComponent(branchName),
      });
      return data.commit.sha;
    } catch {
      return null;
    }
  }
}

export async function createRepositoryBranch({
  integrationId,
  taskId,
  branchName,
  create,
  userId,
}: {
  integrationId: string;
  taskId: string;
  branchName: string;
  create: boolean;
  userId: string;
}) {
  if (!isValidBranchName(branchName)) {
    throw new HTTPException(400, { message: "Invalid branch name" });
  }

  const { integration, config, octokit } = await resolveVerifiedIntegration(
    integrationId,
  );
  const { repositoryOwner: owner, repositoryName: repo } = config;

  const task = await db.query.taskTable.findFirst({
    where: eq(taskTable.id, taskId),
  });
  if (!task) {
    throw new HTTPException(404, { message: "Task not found" });
  }
  // createExternalLink enforces the same invariant; failing early keeps the
  // error message actionable before any GitHub write happens.
  if (task.projectId !== integration.projectId) {
    throw new HTTPException(400, {
      message: "Task does not belong to the integration's project",
    });
  }

  let branchCreated = false;
  const existingSha = await findBranchHead(octokit, owner, repo, branchName);

  if (!existingSha) {
    if (!create) {
      throw new HTTPException(404, {
        message: "Branch not found in the repository",
      });
    }

    const { data: repository } = await octokit.rest.repos.get({ owner, repo });
    const { data: baseRef } = await octokit.rest.git.getRef({
      owner,
      repo,
      ref: `heads/${repository.default_branch.replace(/\//g, "%2F")}`,
    });

    try {
      await octokit.rest.git.createRef({
        owner,
        repo,
        ref: `refs/heads/${branchName}`,
        sha: baseRef.object.sha,
      });
      branchCreated = true;
    } catch (error) {
      // Another developer raced us to the same name; that is success for
      // our purpose as long as the ref now exists.
      const raced = await findBranchHead(octokit, owner, repo, branchName);
      if (!raced) {
        throw error;
      }
    }
  }

  const url = `https://github.com/${owner}/${repo}/tree/${branchName}`;
  const { created: linkCreated } = await createOrUpdateExternalLink({
    taskId,
    integrationId: integration.id,
    resourceType: "branch",
    externalId: branchName,
    url,
    title: branchName,
    metadata: { createdFrom: "kaneo" },
  });

  await publishEvent("task.updated", {
    taskId,
    projectId: task.projectId,
    title: task.title,
    status: task.status,
    userId,
  });

  return {
    integrationId: integration.id,
    repositoryOwner: owner,
    repositoryName: repo,
    branchName,
    url,
    branchCreated,
    linkCreated,
  };
}
