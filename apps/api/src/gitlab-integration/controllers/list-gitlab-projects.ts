import { and, eq, inArray } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { integrationTable } from "../../database/schema";
import type { GitlabTokenType } from "../../plugins/gitlab/config";
import {
  createGitlabClient,
  verifyGitlabToken,
} from "../../plugins/gitlab/utils/gitlab-api";
import { parseGitlabBaseUrl } from "../utils/normalize-input";
import { gitlabRepositoryKey } from "./create-gitlab-integration";

type ProjectRow = {
  id: number;
  name: string;
  path_with_namespace: string;
  name_with_namespace: string;
  visibility: string;
  web_url: string;
};

const PER_PAGE = 50;
const MAX_PAGES = 50;

// RFC 0001 WP4: annotate each listed project with its linked state using a
// single query on repository_key. Per decision D1 the annotation is
// informational for cross-project links; the picker blocks only same-project
// duplicates. When the picker shows a project already linked to the
// addressed project, selection is blocked with an inline reason;
// cross-project links remain selectable.
async function annotateLinkedState(
  normalizedBase: string,
  projects: ProjectRow[],
) {
  if (projects.length === 0) return [];
  const keys = projects.map((project) =>
    gitlabRepositoryKey(normalizedBase, project.path_with_namespace),
  );
  const links = await db.query.integrationTable.findMany({
    where: and(
      eq(integrationTable.type, "gitlab"),
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
  return projects.map((project, index) => ({
    ...project,
    linkedTo: linksByKey.get(keys[index] as string) ?? null,
  }));
}

async function listGitlabProjects({
  baseUrl,
  accessToken,
  tokenType,
}: {
  baseUrl: string;
  accessToken: string;
  tokenType: GitlabTokenType;
}): Promise<{ projects: Array<ProjectRow & { linkedTo: unknown }> }> {
  const normalized = parseGitlabBaseUrl(baseUrl);

  try {
    await verifyGitlabToken(normalized, accessToken, tokenType);
  } catch {
    throw new HTTPException(401, {
      message: "Invalid GitLab token or could not reach instance.",
    });
  }

  const client = createGitlabClient({
    baseUrl: normalized,
    accessToken,
    tokenType,
  });

  const projects: ProjectRow[] = [];

  for (let page = 1; page <= MAX_PAGES; page++) {
    const batch = await client.listMemberProjects(page, PER_PAGE);
    if (batch.length === 0) break;

    for (const project of batch) {
      projects.push({
        id: project.id,
        name: project.name,
        path_with_namespace: project.path_with_namespace,
        name_with_namespace: project.name_with_namespace,
        visibility: project.visibility,
        web_url: project.web_url,
      });
    }

    if (batch.length < PER_PAGE) break;
  }

  return { projects: await annotateLinkedState(normalized, projects) };
}

export default listGitlabProjects;
