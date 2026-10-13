import type { JiraIssue } from "../plugins/jira/utils/jira-api";

// Sprints arrive on each issue: company-managed boards fill a dynamically
// numbered custom field with every sprint the issue was ever in (the current
// one last), team-managed boards fill the system "sprint" field, and older
// Data Center builds ship the sprint as the legacy GreenHopper string. The
// import resolves the field ids by name and reads only those, so nothing else
// in the payload can look like a sprint. These helpers stay free of database
// and Hono imports, like the sprint defaults.

export type ImportedSprint = {
  // Stable within one run: the Jira sprint id when the payload carries one,
  // else the name. Re-runs match imported sprints by name.
  key: string;
  jiraId: string | null;
  name: string;
  state?: string;
  goal?: string;
  startDate?: Date;
  endDate?: Date;
};

/** Maps the Jira sprint state onto the Kaneo sprint status. */
export function sprintStatusFromJiraState(
  state: string | undefined,
): "future" | "active" | "closed" {
  const normalized = (state ?? "").trim().toLowerCase();
  if (normalized === "closed" || normalized === "complete") return "closed";
  if (normalized === "active") return "active";
  return "future";
}

/** Returns every sprint the issue references, deduplicated, current last. */
export function sprintsForIssue(
  issue: JiraIssue,
  sprintFieldIds: string[],
): ImportedSprint[] {
  const fields = issue.fields as unknown as Record<string, unknown>;
  const sprints: ImportedSprint[] = [];
  const seen = new Set<string>();

  for (const fieldId of sprintFieldIds) {
    const value = fields[fieldId];
    const candidates = Array.isArray(value) ? value : [value];

    for (const candidate of candidates) {
      const sprint = toSprint(candidate);
      if (!sprint || seen.has(sprint.key)) continue;
      seen.add(sprint.key);
      sprints.push(sprint);
    }
  }

  return sprints;
}

function toSprint(value: unknown): ImportedSprint | null {
  if (typeof value === "string") return parseLegacySprintString(value);
  if (typeof value !== "object" || value === null) return null;

  const record = value as Record<string, unknown>;
  const name = typeof record.name === "string" ? record.name.trim() : "";
  const state = typeof record.state === "string" ? record.state.trim() : "";
  if (!name || !state) return null;

  const jiraId =
    typeof record.id === "number" || typeof record.id === "string"
      ? String(record.id)
      : null;

  return {
    key: jiraId ?? name,
    jiraId,
    name,
    state,
    goal:
      typeof record.goal === "string" && record.goal.trim()
        ? record.goal
        : undefined,
    startDate: toUtcDate(record.startDate),
    endDate: toUtcDate(record.endDate),
  };
}

// Older Data Center builds serialize the Sprint custom field as the
// GreenHopper toString() output; the relevant attributes are parsed out so DC
// imports still see sprints.
function parseLegacySprintString(value: string): ImportedSprint | null {
  const raw = value.trim();
  if (!raw.startsWith("com.atlassian.greenhopper.service.sprint.Sprint"))
    return null;

  const attribute = (field: string) =>
    raw.match(new RegExp(`\\b${field}=([^,\\]]*)`))?.[1]?.trim();

  const name = attribute("name");
  if (!name) return null;

  const jiraId = attribute("id") ?? null;

  return {
    key: jiraId ?? name,
    jiraId,
    name,
    state: attribute("state") ?? undefined,
    startDate: toUtcDate(attribute("startDate")),
    endDate: toUtcDate(attribute("endDate")),
  };
}

function toUtcDate(value: unknown): Date | undefined {
  if (typeof value !== "string" || !value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}
