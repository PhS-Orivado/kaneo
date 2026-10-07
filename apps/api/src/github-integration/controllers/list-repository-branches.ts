import { resolveVerifiedIntegration } from "./resolve-verified-integration";

const PAGE_SIZE = 100;
// Bounded effort: at most five list calls per search so a query against a
// repository with thousands of branches stays fast and rate-limit friendly.
const MAX_PAGES = 5;

export async function listRepositoryBranches({
  integrationId,
  query,
}: {
  integrationId: string;
  query?: string;
}) {
  const { config, octokit } = await resolveVerifiedIntegration(integrationId);

  const filter = query?.trim().toLowerCase() ?? "";
  const branches: { name: string; commitSha: string | null }[] = [];
  let hasMore = false;

  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data } = await octokit.rest.repos.listBranches({
      owner: config.repositoryOwner,
      repo: config.repositoryName,
      per_page: PAGE_SIZE,
      page,
    });

    for (const branch of data) {
      if (!filter || branch.name.toLowerCase().includes(filter)) {
        branches.push({
          name: branch.name,
          commitSha: branch.commit?.sha ?? null,
        });
      }
    }

    if (data.length < PAGE_SIZE) {
      hasMore = false;
      break;
    }
    hasMore = page === MAX_PAGES;
  }

  return { branches, hasMore };
}
