import { and, eq, inArray } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { integrationTable } from "../../database/schema";
import { repositoryLinkedToSchema } from "../../integrations/response";
import { type z } from "../../openapi";
import { normalizeGiteaBaseUrl } from "../../plugins/gitea/config";
import {
  createGiteaClient,
  verifyGiteaToken,
} from "../../plugins/gitea/utils/gitea-api";
import { giteaRepositoryKey } from "./create-gitea-integration";

type RepoRow = {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  owner: { login: string };
  html_url: string;
};

// RFC 0001 WP3: annotate each listed repository with its linked state using a
// single query on repository_key. Per decision D1 the annotation is
// informational for cross-project links; the picker blocks only same-project
// duplicates. When the picker shows a repository already linked to the
// addressed project, selection is blocked with an inline reason;
// cross-project links remain selectable.
async function annotateLinkedState(
  normalizedBase: string,
  repositories: RepoRow[],
) {
  if (repositories.length === 0) return [];
  const keys = repositories.map((repo) =>
    giteaRepositoryKey(normalizedBase, repo.owner.login, repo.name),
  );
  const links = await db.query.integrationTable.findMany({
    where: and(
      eq(integrationTable.type, "gitea"),
      inArray(integrationTable.repositoryKey, keys),
    ),
    columns: { id: true, projectId: true, repositoryKey: true },
    with: { project: { columns: { name: true } } },
  });
  const linksByKey = new Map(
    links.map((link) => [
      link.repositoryKey,
      {
        integrationId: link.id,
        projectId: link.projectId,
        projectName: link.project?.name ?? null,
      },
    ]),
  );
  return repositories.map((repo, index) => ({
    ...repo,
    linkedTo: linksByKey.get(keys[index] as string) ?? null,
  }));
}

async function listGiteaRepositories({
  baseUrl,
  accessToken,
}: {
  baseUrl: string;
  accessToken: string;
}): Promise<{
  repositories: Array<
    RepoRow & {
      linkedTo: z.infer<typeof repositoryLinkedToSchema> | null;
    }
  >;
}> {
  const normalized = normalizeGiteaBaseUrl(baseUrl);

  try {
    await verifyGiteaToken(normalized, accessToken);
  } catch {
    throw new HTTPException(400, {
      message: "Invalid Gitea token or could not reach instance.",
    });
  }

  const client = createGiteaClient({
    baseUrl: normalized,
    accessToken,
  });

  const all: RepoRow[] = [];
  let page = 1;

  while (true) {
    const batch = await client.listUserRepos(page, 50);
    if (!batch.length) break;

    for (const repo of batch) {
      const ownerLogin = repo.owner?.login ?? repo.owner?.username ?? "";
      all.push({
        id: repo.id,
        name: repo.name,
        full_name: repo.full_name,
        private: repo.private,
        owner: { login: ownerLogin },
        html_url: repo.html_url,
      });
    }

    if (batch.length < 50) break;
    page += 1;
    if (page > 50) break;
  }

  return { repositories: await annotateLinkedState(normalized, all) };
}

export default listGiteaRepositories;
