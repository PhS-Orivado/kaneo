export type FetchLike = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

export type ImportedPriority =
  | "no-priority"
  | "low"
  | "medium"
  | "high"
  | "urgent";

export type ImportedColumn = {
  key: string;
  name: string;
  isFinal: boolean;
};

export type ImportedLabel = {
  key: string;
  name: string;
  color: string;
};

export type ImportedPerson = {
  name?: string;
  email?: string;
};

export type ImportedAttachment = {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  /** Absolute source URL to download the attachment bytes from. */
  url: string;
};

export type ImportedSprintState = "future" | "active" | "closed";

export type ImportedSprint = {
  key: string;
  name: string;
  state: ImportedSprintState;
  goal?: string;
  startDate?: string;
  endDate?: string;
  taskKeys: string[];
};

export type ImportedComment = {
  /** Source comment id, when the source provides one; lets the import keep a reference to it. */
  id?: string;
  author: ImportedPerson;
  body: string;
  createdAt?: string;
};

export type ImportedTask = {
  key: string;
  number?: number;
  columnKey: string | null;
  archived?: boolean;
  title: string;
  description: string;
  priority: ImportedPriority;
  startDate?: string;
  dueDate?: string;
  createdAt?: string;
  assignee?: ImportedPerson;
  labelKeys: string[];
  comments: ImportedComment[];
  attachments?: ImportedAttachment[];
  sprintKey?: string | null;
  /** Human key the source shows in text, e.g. "ABC-123". */
  sourceLabel?: string;
  /** Canonical source URL of the task, when the source has one. */
  sourceUrl?: string;
};

export type DownloadedAttachment = {
  body: ArrayBuffer;
  contentType: string;
  size: number;
};

export type ImportedRelationType = "subtask" | "blocks" | "related";

export type ImportedRelation = {
  sourceKey: string;
  targetKey: string;
  type: ImportedRelationType;
};

export type ImportedProject = {
  name: string;
  key?: string;
  description?: string;
  /** Base URL of the source site, when known; lets the import rewrite links that point at it. */
  sourceUrl?: string;
  columns: ImportedColumn[];
  labels: ImportedLabel[];
  tasks: ImportedTask[];
  relations: ImportedRelation[];
  sprints?: ImportedSprint[];
  warnings: string[];
};

export type SourceProject = {
  id: string;
  name: string;
  detail?: string;
};

export type ReadProjectOptions = {
  includeComments: boolean;
  onProgress?: (message: string) => void;
  signal?: AbortSignal;
};

export type ImportSource = {
  listProjects(): Promise<SourceProject[]>;
  readProject(
    projectId: string,
    options: ReadProjectOptions,
  ): Promise<ImportedProject>;
  /** Downloads attachment bytes with the source's credentials; absent when the source cannot serve them. */
  downloadAttachment?(
    attachment: ImportedAttachment,
  ): Promise<DownloadedAttachment>;
};

export type ConnectOptions = {
  fetch?: FetchLike;
  signal?: AbortSignal;
};
