import type { AdfDoc } from "./adf.js";

export type JiraUser = {
  accountId?: string;
  key?: string;
  name?: string;
  displayName?: string;
  emailAddress?: string;
  active?: boolean;
};

export type JiraStatus = {
  id?: string;
  name: string;
  statusCategory?: { key?: string; name?: string };
};

export type JiraIssueType = { id?: string; name: string; subtask?: boolean };

export type JiraAttachment = {
  id: string;
  filename: string;
  mimeType?: string;
  content?: string;
  size?: number;
  author?: JiraUser;
  created?: string;
};

export type JiraComment = {
  id: string;
  author?: JiraUser;
  body?: AdfDoc | null;
  created?: string;
  updated?: string;
};

export type JiraWorklog = {
  id: string;
  author?: JiraUser;
  started?: string;
  timeSpentSeconds?: number;
  comment?: AdfDoc | string | null;
};

export type JiraIssueRef = {
  id?: string;
  key: string;
  fields?: { summary?: string; issuetype?: JiraIssueType };
};

export type JiraIssueLink = {
  id: string;
  type: {
    id?: string;
    name: string;
    inward?: string;
    outward?: string;
    subtask?: boolean;
  };
  inwardIssue?: JiraIssueRef;
  outwardIssue?: JiraIssueRef;
};

export type JiraIssueFields = {
  summary?: string;
  description?: AdfDoc | null;
  status?: JiraStatus;
  priority?: { name: string } | null;
  issuetype?: JiraIssueType;
  labels?: string[];
  components?: { name?: string }[] | null;
  versions?: { name?: string }[] | null;
  fixVersions?: { name?: string }[] | null;
  assignee?: JiraUser | null;
  reporter?: JiraUser | null;
  creator?: JiraUser | null;
  created?: string;
  updated?: string;
  duedate?: string | null;
  resolutiondate?: string | null;
  resolution?: { name?: string } | null;
  parent?: JiraIssueRef | null;
  subtasks?: JiraIssueRef[] | null;
  issuelinks?: JiraIssueLink[] | null;
  attachment?: JiraAttachment[] | null;
  comment?: { comments?: JiraComment[]; total?: number } | null;
  worklog?: { worklogs?: JiraWorklog[]; total?: number } | null;
  watches?: { watchCount?: number } | null;
  votes?: { votes?: number } | null;
  environment?: AdfDoc | string | null;
  security?: { name?: string } | null;
  [key: string]: unknown;
};

export type JiraIssue = {
  id?: string;
  key: string;
  fields: JiraIssueFields;
};

export type JiraProject = { id?: string; key: string; name: string };

export type JiraFieldMetadata = {
  id: string;
  key?: string;
  name: string;
  custom?: boolean;
  schema?: {
    type?: string;
    items?: string;
    system?: string;
    custom?: string;
    customId?: number;
  };
};

export const SEARCH_PAGE_SIZE = 100;

export function normalizeBaseUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, "");
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

type SearchPage = {
  issues?: JiraIssue[];
  // Enhanced search API
  nextPageToken?: string;
  // Legacy search API
  startAt?: number;
  maxResults?: number;
  total?: number;
};

export class JiraClient {
  readonly baseUrl: string;
  private readonly email?: string;
  private readonly apiToken?: string;
  private readonly pat?: string;

  constructor(options: {
    baseUrl: string;
    email?: string;
    apiToken?: string;
    pat?: string;
  }) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl);
    this.email = options.email;
    this.apiToken = options.apiToken;
    this.pat = options.pat;
  }

  get isAuthenticated(): boolean {
    return Boolean(this.pat || (this.email && this.apiToken));
  }

  authHeader(): string | null {
    if (this.pat) return `Bearer ${this.pat}`;
    if (this.email && this.apiToken) {
      const encoded = btoa(`${this.email}:${this.apiToken}`);
      return `Basic ${encoded}`;
    }
    return null;
  }

  async getMyself(): Promise<JiraUser> {
    return this.request<JiraUser>("/rest/api/3/myself");
  }

  async listProjects(): Promise<JiraProject[]> {
    return this.request<JiraProject[]>("/rest/api/3/project");
  }

  async listFields(): Promise<JiraFieldMetadata[]> {
    return this.request<JiraFieldMetadata[]>("/rest/api/3/field");
  }

  /**
   * Runs the search JQL and returns every matching issue. Tries the paginated
   * search/jql endpoint first and falls back to the classic search endpoint
   * on instances that do not expose it (older Data Center builds).
   */
  async searchIssues(
    jql: string,
    onProgress?: (message: string) => void,
  ): Promise<JiraIssue[]> {
    try {
      return await this.searchEnhanced(jql, onProgress);
    } catch (error) {
      if (isEnhancedUnavailable(error)) {
        return this.searchLegacy(jql, onProgress);
      }
      throw error;
    }
  }

  private async searchEnhanced(
    jql: string,
    onProgress?: (message: string) => void,
  ): Promise<JiraIssue[]> {
    const issues: JiraIssue[] = [];
    let nextPageToken: string | undefined;

    do {
      const page = await this.request<SearchPage>("/rest/api/3/search/jql", {
        method: "POST",
        body: JSON.stringify({
          jql,
          maxResults: SEARCH_PAGE_SIZE,
          fields: ["*all"],
          expand: ["changelog"],
          ...(nextPageToken ? { nextPageToken } : {}),
        }),
        timeoutMs: 120_000,
      });

      issues.push(...(page.issues ?? []));
      onProgress?.(`Fetched ${issues.length} issue(s)`);
      nextPageToken = page.nextPageToken;
    } while (nextPageToken);

    return issues;
  }

  private async searchLegacy(
    jql: string,
    onProgress?: (message: string) => void,
  ): Promise<JiraIssue[]> {
    const issues: JiraIssue[] = [];
    let startAt = 0;
    let total: number | undefined;

    do {
      const params = new URLSearchParams({
        jql,
        startAt: String(startAt),
        maxResults: String(SEARCH_PAGE_SIZE),
        fields: "*all",
        expand: "changelog",
      });

      const page = await this.request<SearchPage>(
        `/rest/api/3/search?${params.toString()}`,
        { timeoutMs: 120_000 },
      );

      issues.push(...(page.issues ?? []));
      total = page.total;
      startAt += page.issues?.length ?? 0;
      onProgress?.(
        `Fetched ${issues.length}${total ? `/${total}` : ""} issue(s)`,
      );
    } while (total != null && startAt < total);

    return issues;
  }

  /**
   * Returns every comment of an issue. Jira only embeds the first page in the
   * search response, so the endpoint is used whenever the counts disagree.
   */
  async listComments(issueKey: string): Promise<JiraComment[]> {
    const comments: JiraComment[] = [];
    let startAt = 0;
    let total: number | undefined;

    do {
      const page = await this.request<{
        comments?: JiraComment[];
        total?: number;
      }>(
        `/rest/api/3/issue/${encodeURIComponent(issueKey)}/comment` +
          `?startAt=${startAt}&maxResults=100`,
      );

      comments.push(...(page.comments ?? []));
      total = page.total;
      startAt += page.comments?.length ?? 0;
    } while (total != null && startAt < total);

    return comments;
  }

  /** Returns every worklog of an issue, paging the same way as comments. */
  async listWorklogs(issueKey: string): Promise<JiraWorklog[]> {
    const worklogs: JiraWorklog[] = [];
    let startAt = 0;
    let total: number | undefined;

    do {
      const page = await this.request<{
        worklogs?: JiraWorklog[];
        total?: number;
      }>(
        `/rest/api/3/issue/${encodeURIComponent(issueKey)}/worklog` +
          `?startAt=${startAt}&maxResults=100`,
      );

      worklogs.push(...(page.worklogs ?? []));
      total = page.total;
      startAt += page.worklogs?.length ?? 0;
    } while (total != null && startAt < total);

    return worklogs;
  }

  /** Downloads an attachment's bytes from its content URL. */
  async downloadAttachment(
    contentUrl: string,
  ): Promise<{ bytes: ArrayBuffer; contentType?: string }> {
    const res = await this.fetchWithRetry(
      contentUrl,
      {
        headers: { Accept: "*/*" },
      },
      120_000,
    );

    if (!res.ok) {
      throw new Error(`Jira attachment download failed: HTTP ${res.status}`);
    }

    return {
      bytes: await res.arrayBuffer(),
      contentType: res.headers.get("content-type") ?? undefined,
    };
  }

  private async request<T>(
    path: string,
    init?: RequestInit & { timeoutMs?: number },
  ): Promise<T> {
    const { timeoutMs = 30_000, ...rest } = init ?? {};

    const res = await this.fetchWithRetry(
      `${this.baseUrl}${path}`,
      rest,
      timeoutMs,
    );

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
      throw new Error(`Jira ${path}: ${describeError(body, res.status)}`);
    }

    return body as T;
  }

  private async fetchWithRetry(
    url: string,
    init: RequestInit,
    timeoutMs: number,
  ): Promise<Response> {
    const maxAttempts = 4;
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const headers = new Headers(init.headers);
      const auth = this.authHeader();
      if (auth && !headers.has("Authorization")) {
        headers.set("Authorization", auth);
      }
      if (init.body != null && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
      }

      try {
        const res = await fetch(url, {
          ...init,
          headers,
          signal: AbortSignal.timeout(timeoutMs),
        });

        // Atlassian throttles with 429 and occasionally 503; Retry-After wins.
        if (
          (res.status === 429 || res.status === 503) &&
          attempt < maxAttempts
        ) {
          const retryAfter = Number(res.headers.get("retry-after"));
          const delay =
            Number.isFinite(retryAfter) && retryAfter > 0
              ? retryAfter * 1000
              : backoffMs(attempt);
          await sleep(Math.min(delay, 30_000));
          continue;
        }

        return res;
      } catch (error) {
        lastError = error;
        if (attempt < maxAttempts) {
          await sleep(backoffMs(attempt));
          continue;
        }
      }
    }

    throw new Error(
      `Jira request to ${url} failed after ${maxAttempts} attempts: ${
        lastError instanceof Error ? lastError.message : String(lastError)
      }`,
    );
  }
}

function isEnhancedUnavailable(error: unknown): boolean {
  return (
    error instanceof Error &&
    /search\/jql:.*(HTTP (404|410)|not found)/i.test(error.message)
  );
}

function backoffMs(attempt: number): number {
  return Math.min(1000 * 2 ** (attempt - 1), 8000);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function describeError(body: unknown, status: number): string {
  if (status === 401) {
    return "unauthorized (HTTP 401), check your Jira email and API token";
  }
  if (status === 403) {
    return "forbidden (HTTP 403), your Jira account may lack access to this resource";
  }
  if (typeof body === "object" && body !== null) {
    const record = body as Record<string, unknown>;
    for (const key of ["errorMessages", "message", "error"]) {
      const value = record[key];
      if (typeof value === "string" && value.length > 0) return value;
      if (Array.isArray(value) && value.length > 0) {
        return value.map(String).join("; ").slice(0, 300);
      }
    }
  }
  if (typeof body === "string" && body.length > 0) {
    return body.length > 300 ? `${body.slice(0, 300)}…` : body;
  }
  return `HTTP ${status}`;
}
