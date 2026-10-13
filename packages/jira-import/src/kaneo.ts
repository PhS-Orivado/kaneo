export type KaneoWorkspace = { id: string; name: string; slug?: string };
export type KaneoProject = { id: string; name: string; slug: string };
export type KaneoColumn = { id: string; name: string; slug: string };
export type KaneoTask = { id: string; title: string; number: number };
export type KaneoLabel = { id: string; name: string; color: string };
export type KaneoMember = { id: string; name: string; email: string };
export type KaneoCustomField = {
  id: string;
  name: string;
  type: "text" | "number" | "date" | "dropdown" | "boolean" | "multiselect";
};
export type KaneoInvitationResult = {
  email: string;
  status: "created" | "already_member" | "already_invited" | "error";
  id?: string;
  expiresAt?: string;
  emailed: boolean;
  error?: string;
};

export type UploadSurface = "description" | "comment";

export function normalizeBaseUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, "");
  try {
    const url = new URL(trimmed);
    let path = url.pathname.replace(/\/+$/, "");
    if (path === "/api" || path.endsWith("/api")) {
      path = path.replace(/\/?api$/, "") || "/";
    }
    return `${url.protocol}//${url.host}${path === "/" ? "" : path}`;
  } catch {
    return trimmed.replace(/\/api\/?$/, "").replace(/\/+$/, "");
  }
}

export class KaneoClient {
  readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(options: { baseUrl: string; apiKey: string }) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl);
    this.apiKey = options.apiKey;
  }

  listWorkspaces(): Promise<KaneoWorkspace[]> {
    return this.request<KaneoWorkspace[]>("/api/auth/organization/list");
  }

  listProjects(workspaceId: string): Promise<KaneoProject[]> {
    return this.request<KaneoProject[]>(
      `/api/project?workspaceId=${encodeURIComponent(workspaceId)}`,
    );
  }

  listMembers(workspaceId: string): Promise<KaneoMember[]> {
    return this.request<KaneoMember[]>(
      `/api/workspace/${encodeURIComponent(workspaceId)}/members`,
    );
  }

  /**
   * Creates pending workspace invitations in bulk. No email is sent unless
   * an address is marked sendEmail, so the caller decides who is notified;
   * every result carries the invitation id so the accept link can be shared
   * manually.
   */
  createInvitations(
    workspaceId: string,
    input: {
      role?: string;
      invitations: { email: string; sendEmail: boolean }[];
    },
  ): Promise<{ invitations: KaneoInvitationResult[] }> {
    return this.request(
      `/api/workspace/${encodeURIComponent(workspaceId)}/invitations`,
      {
        method: "POST",
        body: JSON.stringify(input),
      },
    );
  }

  createProject(input: {
    name: string;
    workspaceId: string;
    icon: string;
    slug: string;
  }): Promise<KaneoProject> {
    return this.request<KaneoProject>("/api/project", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  listColumns(projectId: string): Promise<KaneoColumn[]> {
    return this.request<KaneoColumn[]>(
      `/api/column/${encodeURIComponent(projectId)}`,
    );
  }

  createColumn(
    projectId: string,
    input: { name: string; isFinal?: boolean },
  ): Promise<KaneoColumn> {
    return this.request<KaneoColumn>(
      `/api/column/${encodeURIComponent(projectId)}`,
      {
        method: "POST",
        body: JSON.stringify(input),
      },
    );
  }

  deleteColumn(columnId: string): Promise<unknown> {
    return this.request(`/api/column/${encodeURIComponent(columnId)}`, {
      method: "DELETE",
    });
  }

  createTask(
    projectId: string,
    input: {
      title: string;
      description: string;
      status: string;
      priority: string;
      startDate?: string;
      dueDate?: string;
      userId?: string;
      draftAssetIds?: string[];
      customFields?: { fieldId: string; value: string }[];
    },
  ): Promise<KaneoTask> {
    return this.request<KaneoTask>(
      `/api/task/${encodeURIComponent(projectId)}`,
      {
        method: "POST",
        body: JSON.stringify(input),
      },
    );
  }

  // Never use PUT /label/:id/task: it moves an existing label row off
  // whichever task already had it. This upserts in both scopes.
  createLabel(input: {
    name: string;
    color: string;
    workspaceId: string;
    taskId?: string;
  }): Promise<KaneoLabel> {
    return this.request<KaneoLabel>("/api/label", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  createTaskRelation(input: {
    sourceTaskId: string;
    targetTaskId: string;
    relationType: "subtask" | "blocks" | "related";
  }): Promise<unknown> {
    return this.request("/api/task-relation", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  createComment(
    taskId: string,
    content: string,
    externalUserName?: string,
    externalSource: "jira" = "jira",
  ): Promise<unknown> {
    return this.request(`/api/comment/${encodeURIComponent(taskId)}`, {
      method: "POST",
      body: JSON.stringify({
        content,
        ...(externalUserName ? { externalUserName, externalSource } : {}),
      }),
    });
  }

  createCustomField(input: {
    projectId: string;
    name: string;
    type: KaneoCustomField["type"];
    required?: boolean;
    options?: string[];
  }): Promise<KaneoCustomField> {
    return this.request<KaneoCustomField>("/api/custom-field", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  listCustomFields(projectId: string): Promise<KaneoCustomField[]> {
    return this.request<KaneoCustomField[]>(
      `/api/custom-field/project/${encodeURIComponent(projectId)}`,
    );
  }

  setCustomFieldValue(input: {
    taskId: string;
    fieldId: string;
    value: string;
  }): Promise<unknown> {
    return this.request("/api/custom-field/value", {
      method: "PUT",
      body: JSON.stringify(input),
    });
  }

  createTimeEntry(input: {
    taskId: string;
    startTime: string;
    endTime?: string;
    description?: string;
  }): Promise<unknown> {
    return this.request("/api/time-entry", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  /**
   * Stage an attachment before the task exists. Kaneo issues a presigned URL,
   * the bytes are PUT there by uploadAssetBytes, and finalizeStagedTaskAsset
   * returns the asset that createTask's draftAssetIds accepts.
   */
  stageTaskAsset(
    projectId: string,
    input: { filename: string; contentType: string; size: number },
  ): Promise<{
    key: string;
    uploadUrl: string;
    headers: Record<string, string>;
  }> {
    return this.request(
      `/api/task/draft-upload/${encodeURIComponent(projectId)}`,
      {
        method: "POST",
        body: JSON.stringify({ ...input, surface: "description" }),
      },
    );
  }

  finalizeStagedTaskAsset(
    projectId: string,
    input: {
      key: string;
      filename: string;
      contentType: string;
      size: number;
    },
  ): Promise<{ id: string; url: string }> {
    return this.request(
      `/api/task/draft-upload/${encodeURIComponent(projectId)}/finalize`,
      {
        method: "POST",
        body: JSON.stringify({ ...input, surface: "description" }),
      },
    );
  }

  /** Upload route for assets on an existing task (comments and late images). */
  createTaskAsset(
    taskId: string,
    input: {
      filename: string;
      contentType: string;
      size: number;
      surface: UploadSurface;
    },
  ): Promise<{
    key: string;
    uploadUrl: string;
    headers: Record<string, string>;
  }> {
    return this.request(
      `/api/task/image-upload/${encodeURIComponent(taskId)}`,
      {
        method: "POST",
        body: JSON.stringify(input),
      },
    );
  }

  finalizeTaskAsset(
    taskId: string,
    input: {
      key: string;
      filename: string;
      contentType: string;
      size: number;
      surface: UploadSurface;
    },
  ): Promise<{ id: string; url: string }> {
    return this.request(
      `/api/task/image-upload/${encodeURIComponent(taskId)}/finalize`,
      {
        method: "POST",
        body: JSON.stringify(input),
      },
    );
  }

  /**
   * Puts bytes into a presigned URL. The URL already carries authorization,
   * so the API key is deliberately not attached.
   */
  async uploadAssetBytes(
    uploadUrl: string,
    headers: Record<string, string>,
    bytes: ArrayBuffer,
  ): Promise<void> {
    let res: Response;
    try {
      res = await fetch(uploadUrl, {
        method: "PUT",
        headers,
        body: bytes,
        signal: AbortSignal.timeout(120_000),
      });
    } catch (error) {
      throw new Error(
        `Kaneo attachment upload failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    if (!res.ok) {
      throw new Error(`Kaneo attachment upload failed: HTTP ${res.status}`);
    }
  }

  private async request<T>(
    path: string,
    init?: RequestInit & { timeoutMs?: number },
  ): Promise<T> {
    const { timeoutMs = 30_000, ...rest } = init ?? {};

    const headers = new Headers(rest?.headers);
    headers.set("Authorization", `Bearer ${this.apiKey}`);
    headers.set("Accept", "application/json");
    if (rest?.body != null && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        ...rest,
        headers,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`Kaneo ${path}: ${reason}`);
    }

    const text = await res.text();
    let body: unknown = null;
    if (text) {
      try {
        body = JSON.parse(text) as unknown;
      } catch {
        body = text;
      }
    }

    if (!res.ok) {
      throw new Error(`Kaneo ${path}: ${describeError(body, res.status)}`);
    }

    return body as T;
  }
}

function describeError(body: unknown, status: number): string {
  if (status === 401) {
    return "unauthorized (HTTP 401), check your Kaneo API key";
  }
  if (typeof body === "object" && body !== null) {
    const record = body as Record<string, unknown>;
    for (const key of ["message", "error"]) {
      const value = record[key];
      if (typeof value === "string" && value.length > 0) return value;
    }
  }
  if (typeof body === "string" && body.length > 0) {
    return body.length > 300 ? `${body.slice(0, 300)}…` : body;
  }
  return `HTTP ${status}`;
}
