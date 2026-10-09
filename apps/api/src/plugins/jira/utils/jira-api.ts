import * as Sentry from "@sentry/node";
import { assertPublicDestination } from "../../../utils/assert-public-destination";
import type { JiraConfig } from "../config";
import { normalizeJiraBaseUrl } from "../config";
import { adfToMarkdown, type AdfDoc } from "./adf";

export type JiraUser = {
  accountId?: string;
  name?: string;
  key?: string;
  displayName?: string;
  emailAddress?: string;
  accountType?: string;
  active?: boolean;
};

export type JiraComment = {
  id: string;
  self: string;
  body: string;
  created?: string;
  updated?: string;
  author?: JiraUser | null;
};

export type JiraIssueLink = {
  id?: string;
  type?: { name?: string; inward?: string; outward?: string } | null;
  inwardIssue?: { key?: string } | null;
  outwardIssue?: { key?: string } | null;
};

export type JiraChangelogItem = {
  field: string;
  fieldtype?: string;
  from?: string | null;
  fromString?: string | null;
  to?: string | null;
  toString?: string | null;
};

export type JiraIssue = {
  id: string;
  key: string;
  self: string;
  fields: {
    summary: string;
    description?: string | null;
    status?: {
      name?: string;
      statusCategory?: { key?: string; name?: string };
    } | null;
    labels?: string[];
    priority?: { name?: string; id?: string } | null;
    updated?: string;
    created?: string;
    issuetype?: { name?: string; subtask?: boolean } | null;
    project?: { key?: string; name?: string } | null;
    creator?: JiraUser | null;
    reporter?: JiraUser | null;
    assignee?: JiraUser | null;
    comment?: { comments?: JiraComment[]; total?: number } | null;
    duedate?: string | null;
    parent?: { key?: string } | null;
    subtasks?: { key?: string }[] | null;
    issuelinks?: JiraIssueLink[] | null;
  };
  changelog?: { histories?: unknown[]; items?: JiraChangelogItem[] } | null;
};

export type JiraProject = {
  id: string;
  key: string;
  name: string;
};

export type JiraField = {
  id: string;
  name?: string;
  custom?: boolean;
};

export type JiraTransition = {
  id: string;
  name: string;
  to?: { name?: string; statusCategory?: { key?: string } } | null;
};

export type JiraApiErrorKind =
  | "REDIRECT"
  | "INVALID_JSON"
  | "HTTP_ERROR"
  | "TIMEOUT"
  | "EMPTY_RESPONSE";

export class JiraApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public kind: JiraApiErrorKind,
    public body?: string,
  ) {
    super(message);
    this.name = "JiraApiError";
  }
}

export type JiraCredentials = Pick<JiraConfig, "baseUrl" | "authMode"> & {
  email?: string;
  apiToken: string;
};

function authHeaders(credentials: JiraCredentials): HeadersInit {
  if (credentials.authMode === "dc") {
    return {
      Authorization: `Bearer ${credentials.apiToken}`,
      "Content-Type": "application/json",
    };
  }
  const basic = Buffer.from(
    `${credentials.email ?? ""}:${credentials.apiToken}`,
  ).toString("base64");
  return {
    Authorization: `Basic ${basic}`,
    "Content-Type": "application/json",
  };
}

const JIRA_FETCH_TIMEOUT_MS = 10_000;

// The enhanced search pages are capped at 100 issues and big JQL pages take
// a while on large projects, so the search waits longer than the interactive
// endpoints (same page size and budget as the import CLI).
const SEARCH_PAGE_SIZE = 100;
const SEARCH_TIMEOUT_MS = 120_000;

export async function jiraFetch<T>(
  credentials: JiraCredentials,
  path: string,
  init?: RequestInit,
  timeoutMs = JIRA_FETCH_TIMEOUT_MS,
): Promise<T | undefined> {
  const root = normalizeJiraBaseUrl(credentials.baseUrl);
  // The enhanced search endpoint only exists on API v3, so paths starting
  // with /rest/ are used as they are; everything else stays on v2.
  const url = path.startsWith("/rest/")
    ? `${root}${path}`
    : `${root}/rest/api/2${path.startsWith("/") ? path : `/${path}`}`;

  await assertPublicDestination(root, "Jira");

  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  if (init?.signal) {
    if (init.signal.aborted) {
      controller.abort();
    } else {
      init.signal.addEventListener("abort", () => controller.abort(), {
        once: true,
      });
    }
  }

  try {
    Sentry.addBreadcrumb({
      category: "integration",
      level: "info",
      data: { integration: "jira" },
    });
    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
      // Following redirects would let a public host bounce the request to an
      // internal address after the destination check has already passed.
      redirect: "manual",
      headers: {
        ...authHeaders(credentials),
        ...init?.headers,
      },
    });

    if (res.status >= 300 && res.status < 400) {
      throw new JiraApiError(
        `Jira request was redirected (HTTP ${res.status})`,
        res.status,
        "REDIRECT",
      );
    }

    const text = await res.text();
    clearTimeout(timeoutId);

    if (!res.ok) {
      throw new JiraApiError(
        `Jira API error ${res.status}`,
        res.status,
        "HTTP_ERROR",
        text,
      );
    }

    if (res.status === 204 || text === "") {
      return undefined;
    }

    try {
      return JSON.parse(text) as T;
    } catch {
      throw new JiraApiError(
        "Jira API returned invalid JSON",
        res.status,
        "INVALID_JSON",
        text,
      );
    }
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof JiraApiError) {
      throw error;
    }
    if (error instanceof Error && error.name === "AbortError") {
      if (timedOut) {
        throw new JiraApiError(
          `Jira request timed out after ${timeoutMs}ms`,
          408,
          "TIMEOUT",
        );
      }
      throw error;
    }
    throw error;
  }
}

const ISSUE_FIELDS =
  "summary,description,status,labels,updated,created,issuetype,project,creator";

export function createJiraClient(config: JiraCredentials) {
  const credentials: JiraCredentials = {
    baseUrl: config.baseUrl,
    authMode: config.authMode,
    email: config.email,
    apiToken: config.apiToken,
  };

  return {
    async getMyself(): Promise<JiraUser> {
      const user = await jiraFetch<JiraUser>(credentials, "/myself");
      if (!user) {
        throw new JiraApiError(
          "Jira user response was empty",
          500,
          "EMPTY_RESPONSE",
        );
      }
      return user;
    },

    async getServerInfo(): Promise<{
      baseUrl?: string;
      version?: string;
      deploymentType?: string;
    }> {
      const info = await jiraFetch<{
        baseUrl?: string;
        version?: string;
        deploymentType?: string;
      }>(credentials, "/serverInfo");
      if (!info) {
        throw new JiraApiError(
          "Jira server info response was empty",
          500,
          "EMPTY_RESPONSE",
        );
      }
      return info;
    },

    async getProject(projectKey: string): Promise<JiraProject> {
      const project = await jiraFetch<JiraProject>(
        credentials,
        `/project/${encodeURIComponent(projectKey)}`,
      );
      if (!project) {
        throw new JiraApiError(
          "Jira project response was empty",
          500,
          "EMPTY_RESPONSE",
        );
      }
      return project;
    },

    async listProjects(): Promise<JiraProject[]> {
      const projects = await jiraFetch<JiraProject[]>(credentials, "/project");
      if (!projects) {
        throw new JiraApiError(
          "Jira projects response was empty",
          500,
          "EMPTY_RESPONSE",
        );
      }
      return projects;
    },

    async listFields(): Promise<JiraField[]> {
      const fields = await jiraFetch<JiraField[]>(credentials, "/field");
      if (!fields) {
        throw new JiraApiError(
          "Jira fields response was empty",
          500,
          "EMPTY_RESPONSE",
        );
      }
      return fields;
    },

    // Runs the search JQL and returns every matching issue. The enhanced
    // /search/jql endpoint comes first because Jira Cloud removed the classic
    // /search endpoint; Data Center and older builds answer 404/410 and fall
    // back to the v2 search.
    async searchIssues(
      projectKey: string,
      extraFields = "",
    ): Promise<JiraIssue[]> {
      const jql = `project = "${projectKey.replace(/"/g, "")}" ORDER BY created ASC`;
      const fields = [
        `${ISSUE_FIELDS},priority,creator,reporter,assignee,parent,subtasks,issuelinks,duedate`,
        extraFields,
      ]
        .join(",")
        .split(",")
        .map((field) => field.trim())
        .filter((field) => field.length > 0);

      try {
        return await searchEnhanced(credentials, jql, fields);
      } catch (error) {
        if (!isEnhancedUnavailable(error)) throw error;
        return await searchLegacy(credentials, jql, fields);
      }
    },

    async getIssue(
      issueKey: string,
      fields = ISSUE_FIELDS,
    ): Promise<JiraIssue> {
      const issue = await jiraFetch<JiraIssue>(
        credentials,
        `/issue/${encodeURIComponent(issueKey)}?fields=${encodeURIComponent(fields)}`,
      );
      if (!issue) {
        throw new JiraApiError(
          "Jira issue response was empty",
          500,
          "EMPTY_RESPONSE",
        );
      }
      return issue;
    },

    async createIssue(fields: Record<string, unknown>): Promise<{
      id: string;
      key: string;
      self: string;
    }> {
      const issue = await jiraFetch<{ id: string; key: string; self: string }>(
        credentials,
        "/issue",
        {
          method: "POST",
          body: JSON.stringify({ fields }),
        },
      );
      if (!issue) {
        throw new JiraApiError(
          "Jira create issue response was empty",
          500,
          "EMPTY_RESPONSE",
        );
      }
      return issue;
    },

    // Jira returns 204 with no body for issue edits, so callers that need the
    // new `fields.updated` timestamp fetch the issue afterwards.
    async editIssue(issueKey: string, fields: Record<string, unknown>) {
      await jiraFetch<unknown>(
        credentials,
        `/issue/${encodeURIComponent(issueKey)}`,
        {
          method: "PUT",
          body: JSON.stringify({ fields }),
        },
      );
    },

    async addComment(issueKey: string, body: string): Promise<JiraComment> {
      const comment = await jiraFetch<JiraComment>(
        credentials,
        `/issue/${encodeURIComponent(issueKey)}/comment`,
        {
          method: "POST",
          body: JSON.stringify({ body }),
        },
      );
      if (!comment) {
        throw new JiraApiError(
          "Jira create comment response was empty",
          500,
          "EMPTY_RESPONSE",
        );
      }
      return comment;
    },

    async listComments(
      issueKey: string,
      startAt = 0,
      maxResults = 100,
    ): Promise<{ comments: JiraComment[]; total: number; startAt: number }> {
      const result = await jiraFetch<{
        comments: JiraComment[];
        total: number;
        startAt: number;
      }>(
        credentials,
        `/issue/${encodeURIComponent(issueKey)}/comment?startAt=${startAt}&maxResults=${maxResults}`,
      );
      if (!result) {
        throw new JiraApiError(
          "Jira comments response was empty",
          500,
          "EMPTY_RESPONSE",
        );
      }
      return result;
    },

    async getTransitions(issueKey: string): Promise<{
      transitions: JiraTransition[];
    }> {
      const result = await jiraFetch<{ transitions: JiraTransition[] }>(
        credentials,
        `/issue/${encodeURIComponent(issueKey)}/transitions`,
      );
      if (!result) {
        throw new JiraApiError(
          "Jira transitions response was empty",
          500,
          "EMPTY_RESPONSE",
        );
      }
      return result;
    },

    async doTransition(issueKey: string, transitionId: string) {
      await jiraFetch<unknown>(
        credentials,
        `/issue/${encodeURIComponent(issueKey)}/transitions`,
        {
          method: "POST",
          body: JSON.stringify({ transition: { id: transitionId } }),
        },
      );
    },
  };
}

async function searchEnhanced(
  credentials: JiraCredentials,
  jql: string,
  fields: string[],
): Promise<JiraIssue[]> {
  const issues: JiraIssue[] = [];
  let nextPageToken: string | undefined;

  do {
    const page = await jiraFetch<{
      issues?: JiraIssue[];
      nextPageToken?: string;
    }>(
      credentials,
      "/rest/api/3/search/jql",
      {
        method: "POST",
        body: JSON.stringify({
          jql,
          maxResults: SEARCH_PAGE_SIZE,
          fields,
          ...(nextPageToken ? { nextPageToken } : {}),
        }),
      },
      SEARCH_TIMEOUT_MS,
    );
    if (!page) {
      throw new JiraApiError(
        "Jira search response was empty",
        500,
        "EMPTY_RESPONSE",
      );
    }

    issues.push(...(page.issues ?? []).map(normalizeSearchIssue));
    nextPageToken = page.nextPageToken;
  } while (nextPageToken);

  return issues;
}

async function searchLegacy(
  credentials: JiraCredentials,
  jql: string,
  fields: string[],
): Promise<JiraIssue[]> {
  const issues: JiraIssue[] = [];
  let startAt = 0;

  while (true) {
    const page = await jiraFetch<{
      issues: JiraIssue[];
      total: number;
      startAt: number;
    }>(
      credentials,
      `/search?jql=${encodeURIComponent(jql)}&startAt=${startAt}` +
        `&maxResults=${SEARCH_PAGE_SIZE}` +
        `&fields=${encodeURIComponent(fields.join(","))}`,
      undefined,
      SEARCH_TIMEOUT_MS,
    );
    if (!page) {
      throw new JiraApiError(
        "Jira search response was empty",
        500,
        "EMPTY_RESPONSE",
      );
    }

    if (page.issues.length === 0) break;

    issues.push(...page.issues);

    startAt += page.issues.length;
    if (startAt >= page.total) break;
  }

  return issues;
}

// Jira Cloud answers 410 (endpoint removed) or 404 (never existed) when the
// enhanced endpoint is unavailable; both mean the legacy search is next.
function isEnhancedUnavailable(error: unknown): boolean {
  return (
    error instanceof JiraApiError &&
    (error.status === 404 || error.status === 410)
  );
}

// The enhanced search is a v3 endpoint: descriptions come back as ADF
// documents instead of wiki markup. They are flattened to markdown here so
// every consumer keeps dealing with plain text; legacy pages skip this
// because v2 already returns wiki markup.
function normalizeSearchIssue(issue: JiraIssue): JiraIssue {
  return {
    ...issue,
    fields: {
      ...issue.fields,
      description:
        adfToMarkdown(
          issue.fields.description as AdfDoc | string | null | undefined,
        ).markdown || null,
    },
  };
}

export async function verifyJiraToken(credentials: JiraCredentials) {
  const user = await jiraFetch<JiraUser>(credentials, "/myself");
  if (!user) {
    throw new JiraApiError(
      "Jira user response was empty",
      500,
      "EMPTY_RESPONSE",
    );
  }
  return user;
}
