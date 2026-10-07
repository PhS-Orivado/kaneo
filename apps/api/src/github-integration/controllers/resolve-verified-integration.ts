import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { integrationTable } from "../../database/schema";
import {
  type GitHubConfig,
  hasVerifiedGitHubBinding,
} from "../../plugins/github/config";
import { getVerifiedInstallationOctokit } from "../../plugins/github/utils/github-app";

/**
 * Load a GitHub binding by integration id and return its config together
 * with an installation octokit whose repository identity was verified.
 */
export async function resolveVerifiedIntegration(integrationId: string) {
  const integration = await db.query.integrationTable.findFirst({
    where: eq(integrationTable.id, integrationId),
  });
  if (!integration || integration.type !== "github") {
    throw new HTTPException(404, { message: "GitHub integration not found" });
  }

  const config = JSON.parse(integration.config) as GitHubConfig;
  if (!hasVerifiedGitHubBinding(config)) {
    throw new HTTPException(409, {
      message: "GitHub integration requires verification",
    });
  }

  const octokit = await getVerifiedInstallationOctokit(config);
  return { integration, config, octokit };
}
