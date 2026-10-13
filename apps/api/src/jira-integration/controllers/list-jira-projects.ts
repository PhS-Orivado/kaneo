import { and, eq, inArray } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { integrationTable } from "../../database/schema";
import { repositoryLinkedToSchema } from "../../integrations/response";
import { type z } from "../../openapi";
import { normalizeJiraBaseUrl } from "../../plugins/jira/config";
import {
  createJiraClient,
  JiraApiError,
  verifyJiraToken,
} from "../../plugins/jira/utils/jira-api";
import { jiraRepositoryKey } from "./create-jira-integration";

// Annotate each listed Jira project with its linked state using a single
// query on repository_key. Same-project links block selection in the
// picker; cross-project links are informational only.
async function annotateLinkedState(
  normalizedBase: string,
  projects: Array<{ id: string; key: string; name: string }>,
) {
  if (projects.length === 0) return [];
  const keys = projects.map((project) =>
    jiraRepositoryKey(normalizedBase, project.key),
  );
  const links = await db.query.integrationTable.findMany({
    where: and(
      eq(integrationTable.type, "jira"),
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

async function listJiraProjects({
  baseUrl,
  authMode,
  email,
  apiToken,
}: {
  baseUrl: string;
  authMode: "cloud" | "dc";
  email?: string;
  apiToken: string;
}): Promise<{
  projects: Array<
    { id: string; key: string; name: string } & {
      linkedTo: z.infer<typeof repositoryLinkedToSchema> | null;
    }
  >;
}> {
  const normalized = normalizeJiraBaseUrl(baseUrl);

  try {
    await verifyJiraToken({
      baseUrl: normalized,
      authMode,
      email,
      apiToken,
    });
  } catch (error) {
    if (error instanceof JiraApiError && error.status === 401) {
      throw new HTTPException(400, {
        message: "Invalid Jira credentials.",
      });
    }
    throw new HTTPException(400, {
      message: "Could not reach the Jira instance.",
    });
  }

  const client = createJiraClient({
    baseUrl: normalized,
    authMode,
    email,
    apiToken,
  });

  let projects: Array<{ id: string; key: string; name: string }>;
  try {
    projects = await client.listProjects();
  } catch (error) {
    if (error instanceof JiraApiError && error.status === 404) {
      throw new HTTPException(400, {
        message: "The URL does not point to a Jira instance.",
      });
    }
    throw error;
  }

  return { projects: await annotateLinkedState(normalized, projects) };
}

export default listJiraProjects;
