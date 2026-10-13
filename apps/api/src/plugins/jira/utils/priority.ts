// Kaneo priorities map onto the standard Jira priority names. The priority
// field is only written at issue creation; afterwards the `priority:<name>`
// label is authoritative, so renames on the Jira side never break sync.
const KANEO_PRIORITY_TO_JIRA: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Highest",
};

const JIRA_TO_KANEO_PRIORITY: Record<string, string> = {
  lowest: "low",
  low: "low",
  medium: "medium",
  high: "high",
  highest: "urgent",
  critical: "urgent",
  blocker: "urgent",
};

export function priorityLabelName(priority: string): string | null {
  const normalized = priority.toLowerCase().trim();
  return normalized in KANEO_PRIORITY_TO_JIRA ? `priority:${normalized}` : null;
}

export function jiraPriorityNameForTask(priority: string | null): string {
  const normalized = (priority ?? "low").toLowerCase().trim();
  return KANEO_PRIORITY_TO_JIRA[normalized] ?? "Low";
}

export function kaneoPriorityForJiraName(
  jiraPriorityName: string | null | undefined,
): string | null {
  if (!jiraPriorityName) return null;
  const normalized = jiraPriorityName.toLowerCase().trim();
  return JIRA_TO_KANEO_PRIORITY[normalized] ?? null;
}
