import { and, eq, inArray } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { integrationTable } from "../../database/schema";
import { getGithubApp } from "../../plugins/github/utils/github-app";
import { githubRepositoryKey } from "./create-github-integration";
import { getGithubAccount } from "./verify-repository-owner";

export type RepositoryPage = {
  installationPage: number;
  repositoryPage: number;
};
const PAGE_SIZE = 20;

type ListedRepository = {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  owner: {
    login: string;
    avatar_url: string;
    type: string;
  };
  description: string | null;
  html_url: string;
  updated_at: string;
  installation_id: number;
};

/** Legacy pre-re-keying key form: `github:<owner>/<name>` lowercased. */
function legacyGithubRepositoryKey(
  ownerLogin: string,
  repositoryName: string,
): string {
  return `github:${ownerLogin}/${repositoryName}`.toLowerCase();
}

// RFC 0001 WP2: annotate each listed repository with its linked state using
// a single query on repository_key (numeric keys for verified bindings plus
// the legacy owner/name form). Per decision D1 the annotation is
// informational for cross-project links; only the picker UI blocks
// same-project duplicates.
async function annotateLinkedState(repositories: ListedRepository[]) {
  if (repositories.length === 0) return [];
  const keys = new Set<string>();
  for (const repository of repositories) {
    keys.add(githubRepositoryKey(repository.id));
    keys.add(legacyGithubRepositoryKey(repository.owner.login, repository.name));
  }
  const links = await db.query.integrationTable.findMany({
    where: and(
      eq(integrationTable.type, "github"),
      inArray(integrationTable.repositoryKey, [...keys]),
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
  return repositories.map((repository) => ({
    ...repository,
    linkedTo:
      linksByKey.get(githubRepositoryKey(repository.id)) ??
      linksByKey.get(
        legacyGithubRepositoryKey(repository.owner.login, repository.name),
      ) ??
      null,
  }));
}

/** One bounded page. Never return other users' repository or installation metadata. */
async function listUserRepositories(userId: string, page: RepositoryPage) {
  const account = await getGithubAccount(userId);
  const app = getGithubApp(true);
  if (!app)
    throw new HTTPException(503, {
      message: "GitHub integration is unavailable",
    });
  const request = { timeout: 10_000 };
  const { data: installations } = await app.octokit.rest.apps.listInstallations(
    {
      per_page: 1,
      page: page.installationPage,
      request,
    },
  );
  const installation = installations[0];
  if (!installation)
    return { repositories: [], installations: [], total: 0, nextPage: null };
  const octokit = await app.getInstallationOctokit(installation.id);
  const { data: identity } = await octokit.rest.users.getById({
    account_id: Number(account.accountId),
    request,
  });
  if (String(identity.id) !== account.accountId)
    throw new HTTPException(403, {
      message: "GitHub identity could not be verified",
    });
  const { data } = await octokit.rest.apps.listReposAccessibleToInstallation({
    per_page: PAGE_SIZE,
    page: page.repositoryPage,
    request,
  });
  const repositories: ListedRepository[] = [];
  // Bound concurrent requests as well as the total per page.
  for (let offset = 0; offset < data.repositories.length; offset += 4) {
    const candidates = data.repositories.slice(offset, offset + 4);
    const authorized = await Promise.all(
      candidates.map(async (repo) => {
        try {
          const { data: permission } =
            await octokit.rest.repos.getCollaboratorPermissionLevel({
              owner: repo.owner.login,
              repo: repo.name,
              username: identity.login,
              request,
            });
          if (permission.permission !== "admin") return null;
          return {
            id: repo.id,
            name: repo.name,
            full_name: repo.full_name,
            private: repo.private,
            owner: {
              login: repo.owner.login,
              avatar_url: repo.owner.avatar_url,
              type: repo.owner.type,
            },
            description: repo.description,
            html_url: repo.html_url,
            updated_at: repo.updated_at ?? "",
            installation_id: installation.id,
          };
        } catch (error) {
          if ((error as { status?: number }).status === 404) return null;
          throw new HTTPException(502, {
            message: "GitHub access verification is temporarily unavailable",
          });
        }
      }),
    );
    repositories.push(...authorized.filter((repo) => repo !== null));
  }
  const annotated = await annotateLinkedState(repositories);
  return {
    repositories: annotated,
    installations: annotated.length
      ? [
          {
            id: installation.id,
            account: installation.account,
            repositories: annotated.map((repo) => repo.full_name),
          },
        ]
      : [],
    total: annotated.length,
    nextPage:
      data.repositories.length === PAGE_SIZE
        ? {
            installationPage: page.installationPage,
            repositoryPage: page.repositoryPage + 1,
          }
        : { installationPage: page.installationPage + 1, repositoryPage: 1 },
  };
}
export default listUserRepositories;
