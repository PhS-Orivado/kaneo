import type {
  ImportedSprint,
  ImportedSprintState,
} from "../types.js";
import type { JiraSprint } from "./api-types.js";
import type { JiraClient } from "./client.js";

export type SprintRead = {
  sprints: ImportedSprint[];
  /** Maps a Jira issue id to the sprint key it belongs to. */
  taskSprintKeys: ReadonlyMap<string, string>;
  unavailable: boolean;
};

export function mapSprintState(
  state: string | null | undefined,
): ImportedSprintState {
  const normalized = state?.trim().toLowerCase();
  if (normalized === "active") return "active";
  if (normalized === "closed" || normalized === "completed") return "closed";
  return "future";
}

export function mapSprint(sprint: JiraSprint): ImportedSprint {
  const goal = sprint.goal?.trim();
  const startDate = isoDate(sprint.startDate);
  const endDate = isoDate(sprint.endDate);
  return {
    key: String(sprint.id),
    name: sprint.name?.trim() || `Sprint ${sprint.id}`,
    state: mapSprintState(sprint.state),
    ...(goal ? { goal } : {}),
    ...(startDate ? { startDate } : {}),
    ...(endDate ? { endDate } : {}),
    taskKeys: [],
  };
}

export async function readBoardSprints(
  client: JiraClient,
  boardId: number,
): Promise<SprintRead> {
  const sprints: ImportedSprint[] = [];
  const taskSprintKeys = new Map<string, string>();
  let startAt = 0;

  for (;;) {
    const page = await client.boardSprints(boardId, startAt);
    const values = page?.values ?? [];
    for (const sprint of values) {
      const mapped = mapSprint(sprint);
      mapped.taskKeys = await readSprintTaskKeys(client, sprint.id);
      for (const taskId of mapped.taskKeys) {
        // An issue that appears in several sprint lists stays in the first one
        // seen; Jira normally removes moved issues from the earlier sprint.
        if (!taskSprintKeys.has(taskId)) {
          taskSprintKeys.set(taskId, mapped.key);
        }
      }
      sprints.push(mapped);
    }
    const pageSize = page?.maxResults ?? values.length;
    const total = page?.total;
    startAt += values.length;
    const done =
      values.length === 0 ||
      page?.isLast === true ||
      (typeof total === "number" && startAt >= total) ||
      values.length < Math.max(pageSize, 1);
    if (done) break;
  }

  return { sprints, taskSprintKeys, unavailable: false };
}

async function readSprintTaskKeys(
  client: JiraClient,
  sprintId: number,
): Promise<string[]> {
  const taskKeys: string[] = [];
  let startAt = 0;

  for (;;) {
    const page = await client.sprintIssues(sprintId, startAt);
    const issues = page?.issues ?? [];
    for (const issue of issues) {
      if (issue.id) taskKeys.push(String(issue.id));
    }
    const pageSize = page?.maxResults ?? issues.length;
    startAt += issues.length;
    if (
      issues.length === 0 ||
      issues.length < Math.max(pageSize, 1) ||
      page?.isLast === true
    ) {
      return taskKeys;
    }
  }
}

function isoDate(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const time = Date.parse(value);
  return Number.isNaN(time) ? undefined : new Date(time).toISOString();
}
