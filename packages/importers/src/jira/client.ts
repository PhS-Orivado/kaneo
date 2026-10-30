import { createJsonClient, type JsonClient, SourceHttpError } from "../http.js";
import type { DownloadedAttachment, FetchLike, ImportedAttachment } from "../types.js";
import type {
  JiraAttachment,
  JiraBoardConfiguration,
  JiraBoardPage,
  JiraCloudSearchPage,
  JiraCommentPage,
  JiraIssueTypeStatuses,
  JiraProject,
  JiraProjectPage,
  JiraServerSearchPage,
  JiraSprintIssuePage,
  JiraSprintPage,
  JiraUser,
} from "./api-types.js";
import type { JiraAuth } from "./auth.js";
import { toJiraError } from "./errors.js";
import type { JiraSite } from "./url.js";

export const PROJECTS_PAGE_SIZE = 50;
export const SEARCH_PAGE_SIZE = 100;
export const COMMENTS_PAGE_SIZE = 100;
const DOWNLOAD_TIMEOUT_MS = 60_000;

export type JiraClientOptions = {
  site: JiraSite;
  auth: JiraAuth;
  fetch?: FetchLike;
  signal?: AbortSignal;
};

export type SearchQuery = {
  jql: string;
  fields: string[];
};

export class JiraClient {
  readonly cloud: boolean;
  private readonly http: JsonClient;
  private readonly api: string;

  constructor(private readonly options: JiraClientOptions) {
    this.cloud = options.site.cloud;
    this.api = `/rest/api/${options.auth.apiVersion}`;
    this.http = createJsonClient({
      service: "Jira",
      baseUrl: options.site.baseUrl,
      headers: () => ({ Authorization: options.auth.authorization }),
      fetch: options.fetch,
      signal: options.signal,
    });
  }

  withSignal(signal: AbortSignal | undefined): JiraClient {
    if (!signal) return this;
    const current = this.options.signal;
    return new JiraClient({
      ...this.options,
      signal: current ? AbortSignal.any([current, signal]) : signal,
    });
  }

  myself(): Promise<JiraUser | null> {
    return this.request(`${this.api}/myself`);
  }

  async listProjects(): Promise<JiraProject[]> {
    if (!this.cloud) {
      return (
        (await this.request<JiraProject[] | null>(`${this.api}/project`)) ?? []
      );
    }
    const projects: JiraProject[] = [];
    for (;;) {
      const params = new URLSearchParams({
        startAt: String(projects.length),
        maxResults: String(PROJECTS_PAGE_SIZE),
      });
      const page = await this.request<JiraProjectPage | null>(
        `${this.api}/project/search?${params}`,
      );
      const values = page?.values ?? [];
      projects.push(...values);
      if (page?.isLast !== false || values.length === 0) return projects;
    }
  }

  getProject(projectKey: string): Promise<JiraProject> {
    return this.request(
      `${this.api}/project/${encodeURIComponent(projectKey)}`,
    );
  }

  async projectStatuses(projectKey: string): Promise<JiraIssueTypeStatuses[]> {
    return (
      (await this.request<JiraIssueTypeStatuses[] | null>(
        `${this.api}/project/${encodeURIComponent(projectKey)}/statuses`,
      )) ?? []
    );
  }

  boards(projectKey: string): Promise<JiraBoardPage | null> {
    const params = new URLSearchParams({ projectKeyOrId: projectKey });
    return this.request(`/rest/agile/1.0/board?${params}`);
  }

  boardConfiguration(boardId: number): Promise<JiraBoardConfiguration | null> {
    return this.request(
      `/rest/agile/1.0/board/${encodeURIComponent(String(boardId))}/configuration`,
    );
  }

  boardSprints(boardId: number, startAt: number): Promise<JiraSprintPage | null> {
    const params = new URLSearchParams({
      startAt: String(startAt),
      maxResults: String(SEARCH_PAGE_SIZE),
    });
    return this.request(
      `/rest/agile/1.0/board/${encodeURIComponent(String(boardId))}/sprint?${params}`,
    );
  }

  sprintIssues(
    sprintId: number,
    startAt: number,
  ): Promise<JiraSprintIssuePage | null> {
    const params = new URLSearchParams({
      startAt: String(startAt),
      maxResults: String(SEARCH_PAGE_SIZE),
    });
    return this.request(
      `/rest/agile/1.0/sprint/${encodeURIComponent(String(sprintId))}/issue?${params}`,
    );
  }

  async downloadAttachment(
    attachment: ImportedAttachment,
  ): Promise<DownloadedAttachment> {
    const fetchImpl: FetchLike =
      this.options.fetch ?? ((input, init) => fetch(input, init));
    const signals = [AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS)];
    if (this.options.signal) signals.push(this.options.signal);
    let response: Response;
    try {
      response = await fetchImpl(attachment.url, {
        headers: { Authorization: this.options.auth.authorization },
        signal: AbortSignal.any(signals),
      });
    } catch (error) {
      throw new Error(
        `Jira could not download "${attachment.filename}": ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (!response.ok) {
      throw toJiraError(
        new SourceHttpError(
          `Jira could not download "${attachment.filename}"`,
          response.status,
          null,
        ),
        this.options.auth.rejectedMessage,
      );
    }
    const body = await response.arrayBuffer();
    return {
      body,
      contentType:
        response.headers.get("content-type")?.split(";")[0]?.trim() ||
        attachment.mimeType,
      size: body.byteLength,
    };
  }

  searchCloud(
    query: SearchQuery,
    nextPageToken: string | undefined,
  ): Promise<JiraCloudSearchPage | null> {
    return this.request(`${this.api}/search/jql`, {
      method: "POST",
      body: JSON.stringify({
        jql: query.jql,
        maxResults: SEARCH_PAGE_SIZE,
        fields: query.fields,
        expand: "renderedFields",
        ...(nextPageToken ? { nextPageToken } : {}),
      }),
    });
  }

  searchServer(
    query: SearchQuery,
    startAt: number,
  ): Promise<JiraServerSearchPage | null> {
    const params = new URLSearchParams({
      jql: query.jql,
      startAt: String(startAt),
      maxResults: String(SEARCH_PAGE_SIZE),
      fields: query.fields.join(","),
      expand: "renderedFields",
    });
    return this.request(`${this.api}/search?${params}`);
  }

  comments(issueId: string, startAt: number): Promise<JiraCommentPage | null> {
    const params = new URLSearchParams({
      startAt: String(startAt),
      maxResults: String(COMMENTS_PAGE_SIZE),
      expand: "renderedBody",
    });
    return this.request(
      `${this.api}/issue/${encodeURIComponent(issueId)}/comment?${params}`,
    );
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    try {
      return await this.http.request<T>(path, init);
    } catch (error) {
      throw toJiraError(error, this.options.auth.rejectedMessage);
    }
  }
}
