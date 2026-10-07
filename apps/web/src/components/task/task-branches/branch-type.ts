/** Branch kinds a task branch can be created with, e.g. fix/EC-123. */
export const BRANCH_TYPES = [
  "fix",
  "feature",
  "docs",
  "chore",
  "refactor",
  "test",
  "release",
] as const;

export type BranchType = (typeof BRANCH_TYPES)[number];

/** Ticket key shown to developers, e.g. EC-123. */
export function ticketId(
  projectSlug: string | null | undefined,
  taskNumber: number | null | undefined,
): string {
  if (!projectSlug || !taskNumber) return "";
  return `${projectSlug.toUpperCase()}-${taskNumber}`;
}

export function buildTypedBranchName(
  type: BranchType,
  ticket: string,
): string {
  return ticket ? `${type}/${ticket}` : "";
}

const LABEL_TYPE_HINTS: [RegExp, BranchType][] = [
  [/^(bug|bugfix|fix|defect|error)$/i, "fix"],
  [/^(feature|feat|enhancement|story)$/i, "feature"],
  [/^(doc|docs|documentation)$/i, "docs"],
  [/^chore(s)?$/i, "chore"],
  [/^refactor(ing)?$/i, "refactor"],
  [/^(test|tests|testing)$/i, "test"],
  [/^(release|hotfix)$/i, "release"],
];

/** Derive the branch kind from the task's labels; feature is the fallback. */
export function defaultBranchType(labelNames: string[]): BranchType {
  for (const name of labelNames) {
    for (const [pattern, type] of LABEL_TYPE_HINTS) {
      if (pattern.test(name.trim())) return type;
    }
  }
  return "feature";
}
