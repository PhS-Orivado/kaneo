import { and, eq, inArray } from "drizzle-orm";
import db from "../../database";
import { integrationTable } from "../../database/schema";

const GIT_PROVIDERS = ["github", "gitea", "gitlab"] as const;

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

/** Read the project path from a GitLab config without exposing its token. */
function gitlabProjectPath(config: string): string {
  try {
    const parsed = JSON.parse(config) as { projectPath?: unknown };
    return typeof parsed.projectPath === "string" ? parsed.projectPath : "";
  } catch {
    return "";
  }
}

/**
 * Minimal, secret-free view of the project's repository bindings. Any
 * workspace member may read it: picking the repositories to create an issue
 * in is part of creating a task, not of managing settings.
 */
export default async function listProjectRepositoryBindings({
  projectId,
}: {
  projectId: string;
}) {
  const integrations = await db.query.integrationTable.findMany({
    where: and(
      eq(integrationTable.projectId, projectId),
      inArray(integrationTable.type, [...GIT_PROVIDERS]),
    ),
    columns: {
      id: true,
      type: true,
      config: true,
      repositoryOwner: true,
      repositoryName: true,
      repositoryId: true,
      baseUrl: true,
      isActive: true,
      createdAt: true,
    },
    orderBy: (table, { asc }) => [asc(table.createdAt)],
  });

  const bindings = integrations.map((integration) => {
    const host = integration.baseUrl
      ? trimTrailingSlash(integration.baseUrl)
      : null;
    const owner = integration.repositoryOwner ?? "";
    const name = integration.repositoryName ?? "";

    if (integration.type === "gitlab") {
      const projectPath =
        gitlabProjectPath(integration.config) || `${owner}/${name}`;
      return {
        id: integration.id,
        type: integration.type,
        identity: projectPath,
        host,
        externalUrl: `${host ?? ""}/${projectPath}`,
        isActive: integration.isActive !== false,
        requiresVerification: false,
        createdAt: integration.createdAt,
      };
    }

    const identity = `${owner}/${name}`;
    return {
      id: integration.id,
      type: integration.type,
      identity,
      host: integration.type === "github" ? null : host,
      externalUrl:
        integration.type === "github"
          ? `https://github.com/${identity}`
          : `${host ?? ""}/${identity}`,
      isActive: integration.isActive !== false,
      // Legacy GitHub bindings without a verified numeric repository id
      // cannot create issues.
      requiresVerification:
        integration.type === "github" && integration.repositoryId == null,
      createdAt: integration.createdAt,
    };
  });

  return { bindings };
}
