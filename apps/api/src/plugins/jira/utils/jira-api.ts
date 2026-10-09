import * as Sentry from "@sentry/node";
import { assertPublicDestination } from "../../../utils/assert-public-destination";
import type { JiraConfig } from "../config";
import { normalizeJiraBaseUrl } from "../config";

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
  };
  changelog?: { histories?: unknown[]; items?: JiraChangelogItem[] } | null;
};

export type JiraProject = {
  id: string;
  key: string;
  name: string;
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

export async function jiraFetch<T>(
  credentials: JiraCredentials,
  path: string,
  init?: RequestInit,
): Promise<T | undefined> {
  const root = normalizeJiraBaseUrl(credentials.baseUrl);
  const url = `${root}/rest/api/2${path.startsWith("/") ? path : `/${path}`}`;

  await assertPublicDestination(root, "Jira");

  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, JIRA_FETCH_TIMEOUT_MS);
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
          `Jira request timed out after ${JIRA_FETCH_TIMEOUT_MS}ms`,
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

    async searchIssues(
      projectKey: string,
      startAt = 0,
      maxResults = 50,
    ): Promise<{ issues: JiraIssue[]; total: number; startAt: number }> {
      const jql = `project = "${projectKey.replace(/"/g, "")}" ORDER BY created ASC`;
      const result = await jiraFetch<{
        issues: JiraIssue[];
        total: number;
        startAt: number;
      }>(
        credentials,
        `/search?jql=${encodeURIComponent(jql)}&startAt=${startAt}&maxResults=${maxResults}` +
          `&fields=${encodeURIComponent(`${ISSUE_FIELDS},comment,priority,creator,reporter`)}`,
      );
      if (!result) {
        throw new JiraApiError(
          "Jira search response was empty",
          500,
          "EMPTY_RESPONSE",
        );
      }
      return result;
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
