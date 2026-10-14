export const IMPORT_RUN_STATUSES = ["running", "completed", "failed"] as const;

export type ImportRunStatus = (typeof IMPORT_RUN_STATUSES)[number];

export const IMPORT_RUN_PROJECT_STATUSES = [
  "pending",
  "running",
  "completed",
  "failed",
] as const;

export type ImportRunProjectStatus =
  (typeof IMPORT_RUN_PROJECT_STATUSES)[number];

// The order a project import moves through; shown as a live checklist on the
// run page. Reading comes first, users before tasks so created or invited
// people can receive their assignments.
export const IMPORT_RUN_STAGES = [
  "reading",
  "sprints",
  "users",
  "tasks",
  "done",
] as const;

export type ImportStage = (typeof IMPORT_RUN_STAGES)[number];

export function isImportStage(value: unknown): value is ImportStage {
  return (
    typeof value === "string" &&
    (IMPORT_RUN_STAGES as readonly string[]).includes(value)
  );
}

export type ImportCounts = {
  columns: number;
  tasks: number;
  labels: number;
  comments: number;
  assignees: number;
  relations: number;
  sprints: number;
  users: number;
};

export type ImportRunProject = {
  sourceId: string;
  name: string;
  status: ImportRunProjectStatus;
  stage: ImportStage;
  projectId: string | null;
  projectSlug: string | null;
  counts: ImportCounts;
  warnings: string[];
  error: string | null;
};

export const EMPTY_IMPORT_COUNTS: ImportCounts = {
  columns: 0,
  tasks: 0,
  labels: 0,
  comments: 0,
  assignees: 0,
  relations: 0,
  sprints: 0,
  users: 0,
};

export function pendingRunProject(
  sourceId: string,
  name: string,
): ImportRunProject {
  return {
    sourceId,
    name,
    status: "pending",
    stage: "reading",
    projectId: null,
    projectSlug: null,
    counts: { ...EMPTY_IMPORT_COUNTS },
    warnings: [],
    error: null,
  };
}

// Runs persisted before stages existed have no stage field; they load as
// "done" or "reading" so the run page can render them without checks.
export function normalizeRunProject(
  project: Omit<ImportRunProject, "stage" | "counts"> & {
    stage?: ImportStage;
    counts: Partial<ImportCounts>;
  },
): ImportRunProject {
  return {
    ...project,
    stage:
      project.stage ?? (project.status === "completed" ? "done" : "reading"),
    counts: { ...EMPTY_IMPORT_COUNTS, ...project.counts },
  };
}

export function failUnfinishedProjects(
  projects: ImportRunProject[],
  error: string,
): ImportRunProject[] {
  return projects.map((project) =>
    project.status === "pending" || project.status === "running"
      ? { ...project, status: "failed", error }
      : project,
  );
}
