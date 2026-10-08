import { RESERVED_COLUMN_SLUGS, toColumnSlug } from "./keys.js";
import type {
  JiraAttachment,
  JiraIssue,
  JiraIssueLink,
  JiraUser,
} from "./jira.js";

export type PlannedColumn = {
  statusName: string;
  name: string;
  slug: string;
  isFinal: boolean;
  renamedFrom?: string;
};

// Kaneo's valid priorities, mapped from the five Jira defaults.
const PRIORITY_MAP: Record<string, string> = {
  Highest: "urgent",
  High: "high",
  Medium: "medium",
  Low: "low",
  Lowest: "no-priority",
};

export const DEFAULT_PRIORITY = "no-priority";

export function toPriority(jiraPriority: string | null | undefined): string {
  const name = jiraPriority?.trim();
  if (!name) return DEFAULT_PRIORITY;
  return PRIORITY_MAP[name] ?? "medium";
}

const STATUS_CATEGORY_ORDER = ["new", "indeterminate", "done"];

export type StatusPlan = {
  columns: PlannedColumn[];
  slugByStatusName: Map<string, string>;
};

/**
 * One Kaneo column per Jira status actually used by the imported issues.
 * Columns are ordered by status category (To Do, In Progress, Done) so the
 * board reads like the Jira workflow, and the last Done column is final.
 */
export function planStatusColumns(issues: JiraIssue[]): StatusPlan {
  const orderedNames: string[] = [];
  const categoryByName = new Map<string, string>();

  for (const issue of issues) {
    const status = issue.fields.status;
    const name = status?.name?.trim();
    if (!name || categoryByName.has(name)) continue;

    orderedNames.push(name);
    categoryByName.set(name, status?.statusCategory?.key ?? "new");
  }

  orderedNames.sort((a, b) => {
    const rankA = statusRank(categoryByName.get(a));
    const rankB = statusRank(categoryByName.get(b));
    if (rankA !== rankB) return rankA - rankB;
    // Keep first-seen order within a category (Array.prototype.sort is
    // stable, so the original order survives ties).
    return 0;
  });

  const takenSlugs = new Set<string>();
  const columns: PlannedColumn[] = [];

  for (const statusName of orderedNames) {
    const original = statusName;
    let name = toColumnSlug(original) ? original : "Untitled";

    if (RESERVED_COLUMN_SLUGS.includes(toColumnSlug(name))) {
      name = `${name} list`;
    }

    let slug = toColumnSlug(name);
    for (let suffix = 2; takenSlugs.has(slug); suffix++) {
      name = `${name.replace(/ \d+$/, "")} ${suffix}`;
      slug = toColumnSlug(name);
    }

    takenSlugs.add(slug);
    columns.push({
      statusName: original,
      name,
      slug,
      isFinal: false,
      ...(name !== original ? { renamedFrom: original } : {}),
    });
  }

  for (let index = columns.length - 1; index >= 0; index--) {
    const column = columns[index];
    if (!column) break;
    if ((categoryByName.get(column.statusName) ?? "new") === "done") {
      column.isFinal = true;
      break;
    }
  }

  return {
    columns,
    slugByStatusName: new Map(
      columns.map((column) => [column.statusName, column.slug]),
    ),
  };
}

function statusRank(category: string | undefined): number {
  const index = STATUS_CATEGORY_ORDER.indexOf(category ?? "new");
  return index === -1 ? STATUS_CATEGORY_ORDER.length : index;
}

export function toTitle(issue: JiraIssue): string {
  return `[${issue.key}] ${issue.fields.summary ?? "Untitled"}`;
}

/**
 * Kaneo validates startDate <= dueDate; Jira issues can be overdue, so the
 * created timestamp only becomes the start date when it fits before the due
 * date.
 */
export function toDateRange(fields: JiraIssue["fields"]): {
  startDate?: string;
  dueDate?: string;
} {
  const created = toIso(fields.created);
  const due = fields.duedate ? toIso(`${fields.duedate}T23:59:59Z`) : undefined;

  if (!created) return due ? { dueDate: due } : {};
  if (!due) return {};
  if (created > due) return { dueDate: due };

  return { startDate: created, dueDate: due };
}

function toIso(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

export function displayName(user: JiraUser | null | undefined): string {
  return (
    user?.displayName?.trim() ||
    user?.name?.trim() ||
    user?.emailAddress?.trim() ||
    "Unknown user"
  );
}

export function isEpic(issue: JiraIssue): boolean {
  return (issue.fields.issuetype?.name ?? "").trim().toLowerCase() === "epic";
}

/**
 * Every structured classification Jira carries becomes a Kaneo label so it
 * stays filterable on the board.
 */
export function labelsForIssue(issue: JiraIssue): string[] {
  const fields = issue.fields;
  const labels = new Set<string>();

  for (const label of fields.labels ?? []) {
    const trimmed = label.trim();
    if (trimmed) labels.add(trimmed);
  }

  const typeName = fields.issuetype?.name?.trim().toLowerCase();
  if (typeName) labels.add(`type:${typeName}`);

  for (const component of fields.components ?? []) {
    const name = component?.name?.trim();
    if (name) labels.add(`component:${name}`);
  }

  for (const version of [
    ...(fields.versions ?? []),
    ...(fields.fixVersions ?? []),
  ]) {
    const name = version?.name?.trim();
    if (name) labels.add(`version:${name}`);
  }

  const sprint = sprintForIssue(issue);
  if (sprint) labels.add(`sprint:${sprint.name}`);

  if (isEpic(issue)) labels.add("epic");

  return [...labels];
}

export type SprintInfo = { name: string; state?: string; goal?: string };

/** Sprints live in a dynamically numbered custom field; find them by shape. */
export function sprintForIssue(issue: JiraIssue): SprintInfo | null {
  let latest: SprintInfo | null = null;

  for (const value of Object.values(issue.fields)) {
    const candidates = Array.isArray(value) ? value : [value];

    for (const candidate of candidates) {
      if (!isSprintLike(candidate)) continue;
      const name = candidate.name.trim();
      // An issue can belong to several sprints; the last one is the most
      // recent, which is the one the work is actually in.
      if (name) {
        latest = {
          name,
          state: candidate.state,
          ...(typeof candidate.goal === "string" && candidate.goal
            ? { goal: candidate.goal }
            : {}),
        };
      }
    }
  }

  return latest;
}

function isSprintLike(value: unknown): value is {
  name: string;
  state: string;
  goal?: unknown;
} {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.name === "string" && typeof record.state === "string";
}

export type PlannedRelation = {
  relationType: "subtask" | "blocks" | "related";
  sourceKey: string;
  targetKey: string;
  note?: string;
};

/**
 * Maps an issue link to a Kaneo relation with the blocked-by direction
 * normalized: whoever blocks, blocks.
 */
export function relationForLink(
  issue: JiraIssue,
  link: JiraIssueLink,
): PlannedRelation | null {
  const linkName = link.type.name.trim().toLowerCase();
  const inward = link.inwardIssue;
  const outward = link.outwardIssue;

  // "Blocks": this issue blocks the outward one; the inward one blocks this.
  if (linkName === "blocks" || linkName.includes("block")) {
    if (outward) {
      return {
        relationType: "blocks",
        sourceKey: issue.key,
        targetKey: outward.key,
      };
    }
    if (inward) {
      return {
        relationType: "blocks",
        sourceKey: inward.key,
        targetKey: issue.key,
      };
    }
    return null;
  }

  // Everything else Jira offers (relates, duplicates, causes, clones, ...)
  // stays a Kaneo "related" relation, with the original type recorded.
  const other = outward ?? inward;
  if (!other || other.key === issue.key) return null;

  return {
    relationType: "related",
    sourceKey: issue.key,
    targetKey: other.key,
    note: link.type.name,
  };
}

export function isImageAttachment(attachment: JiraAttachment): boolean {
  return (attachment.mimeType ?? "").toLowerCase().startsWith("image/");
}

export function worklogTimes(worklog: {
  started?: string;
  timeSpentSeconds?: number;
}): { startTime?: string; endTime?: string } {
  const started = worklog.started ? new Date(worklog.started) : undefined;
  if (!started || Number.isNaN(started.getTime())) return {};

  const startTime = started.toISOString();
  const seconds = worklog.timeSpentSeconds;
  if (typeof seconds !== "number" || seconds <= 0) return { startTime };

  return {
    startTime,
    endTime: new Date(started.getTime() + seconds * 1000).toISOString(),
  };
}
