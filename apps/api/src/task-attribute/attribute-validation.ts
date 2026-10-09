// RFC 0002 (task attributes): shared constants for workspace-scoped task
// type definitions (task, bug, doc, ...). The color and icon lists are the
// single source of truth for API-side validation (zod schemas) and the
// workspace settings pickers, so the accepted surface never drifts between
// backend and frontend.
//
// Colors intentionally reuse the label palette tokens so attributes render
// with the same design language as labels. Icons are a curated, append-only
// allow-list of lucide identifiers: entries are only ever appended, never
// renamed or removed, because existing rows reference them.

export const TASK_ATTRIBUTE_COLORS = [
  "stone",
  "slate",
  "violet",
  "emerald",
  "green",
  "amber",
  "orange",
  "rose",
  "red",
] as const;

export const TASK_ATTRIBUTE_ICONS = [
  "SquareCheckBig",
  "Bug",
  "FileText",
  "CircleDot",
  "Lightbulb",
  "Wrench",
  "BookOpen",
  "Rocket",
  "Shield",
  "Star",
  "Zap",
  "Beaker",
  "Flag",
  "Heart",
  "Sparkles",
  "Layers",
  "Package",
  "Search",
  "PenLine",
  "GraduationCap",
] as const;

export type TaskAttributeColor = (typeof TASK_ATTRIBUTE_COLORS)[number];
export type TaskAttributeIcon = (typeof TASK_ATTRIBUTE_ICONS)[number];

export const TASK_ATTRIBUTE_NAME_MAX_LENGTH = 64;
export const TASK_ATTRIBUTE_DESCRIPTION_MAX_LENGTH = 256;
export const TASK_ATTRIBUTE_MAX_POSITION = 1_000_000;

// Attributes seeded for every workspace that has none (boot-time runtime
// migration and the workspace-creation hook). "Task" is the workspace default
// so newly created tasks get a meaningful type without any user action.
export const SEED_TASK_ATTRIBUTES = [
  {
    name: "Task",
    description: null,
    icon: "SquareCheckBig",
    iconColor: "slate",
    textColor: "slate",
    position: 0,
    isDefault: true,
  },
  {
    name: "Bug",
    description: null,
    icon: "Bug",
    iconColor: "red",
    textColor: "red",
    position: 1,
    isDefault: false,
  },
  {
    name: "Doc",
    description: null,
    icon: "FileText",
    iconColor: "emerald",
    textColor: "emerald",
    position: 2,
    isDefault: false,
  },
] as const;
