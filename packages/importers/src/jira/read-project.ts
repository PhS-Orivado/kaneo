import { SourceHttpError } from "../http.js";
import type { ImportedProject, ReadProjectOptions } from "../types.js";
import type { JiraComment, JiraProject } from "./api-types.js";
import { readBoardColumns } from "./board.js";
import type { JiraClient } from "./client.js";
import { mapJiraProject } from "./project.js";
import { readComments } from "./read-comments.js";
import { readBoardSprints, type SprintRead } from "./sprints.js";
import { searchProjectIssues } from "./search.js";

export async function readJiraProject(
  client: JiraClient,
  baseUrl: string,
  projectKey: string,
  options: ReadProjectOptions,
): Promise<ImportedProject> {
  const { onProgress } = options;

  onProgress?.("Reading project and board");
  const project = await readProjectDetails(client, projectKey);
  const statusGroups = await client.projectStatuses(project.key);
  const board = await readBoardColumns(client, project.key);

  onProgress?.("Reading issues");
  const issues = await searchProjectIssues(client, project.key, {
    includeComments: options.includeComments,
    onPage: (loaded) => onProgress?.(`Reading issues (${loaded} so far)`),
  });

  let comments = new Map<string, JiraComment[]>();
  if (options.includeComments && issues.length > 0) {
    comments = await readComments(client, issues, onProgress);
  }

  const sprints = await readSprints(client, board.boardId, onProgress);

  return mapJiraProject({
    baseUrl,
    project,
    statusGroups,
    boardColumns: board.columns,
    boardUnavailable: board.unavailable,
    issues,
    comments,
    sprints: sprints.sprints,
    taskSprintKeys: sprints.taskSprintKeys,
    sprintsUnavailable: sprints.unavailable,
  });
}

async function readSprints(
  client: JiraClient,
  boardId: number | null,
  onProgress: ReadProjectOptions["onProgress"],
): Promise<SprintRead> {
  // No board means no sprint data exists for this project, not a failure.
  if (boardId === null) {
    return { sprints: [], taskSprintKeys: new Map(), unavailable: false };
  }
  onProgress?.("Reading sprints");
  try {
    return await readBoardSprints(client, boardId);
  } catch (error) {
    // Sprints are a bonus: an agile API that denies access must not fail
    // the whole project import.
    if (deniedStatus(error) === undefined) throw error;
    return { sprints: [], taskSprintKeys: new Map(), unavailable: true };
  }
}

function deniedStatus(error: unknown): number | undefined {
  return error instanceof SourceHttpError && [401, 403, 404].includes(error.status)
    ? error.status
    : undefined;
}

async function readProjectDetails(
  client: JiraClient,
  projectKey: string,
): Promise<JiraProject> {
  try {
    return await client.getProject(projectKey);
  } catch (error) {
    if (error instanceof SourceHttpError && error.status === 404) {
      throw new Error(
        `Jira could not find the project "${projectKey}", or this account cannot browse it.`,
      );
    }
    throw error;
  }
}
