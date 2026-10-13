import { describe, expect, it } from "vite-plus/test";
import { JiraClient, SEARCH_PAGE_SIZE, normalizeBaseUrl } from "./jira.js";

type Call = { url: string; init?: RequestInit };

function fakeFetch(pages: unknown[], calls: Call[] = [], status = 200) {
  let index = 0;
  return ((url: string | URL | RequestInfo, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const body = pages[index] ?? {};
    index++;
    return Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      }),
    );
  }) as typeof fetch;
}

describe("normalizeBaseUrl", () => {
  it("adds a scheme and strips trailing slashes", () => {
    expect(normalizeBaseUrl("acme.atlassian.net/")).toBe(
      "https://acme.atlassian.net",
    );
  });

  it("keeps an existing scheme", () => {
    expect(normalizeBaseUrl("http://jira.local:8080")).toBe(
      "http://jira.local:8080",
    );
  });
});

describe("JiraClient", () => {
  it("builds a Basic header for API token auth", () => {
    const client = new JiraClient({
      baseUrl: "https://acme.atlassian.net",
      email: "me@acme.com",
      apiToken: "secret",
    });

    expect(client.isAuthenticated).toBe(true);
    expect(client.authHeader()).toBe(`Basic ${btoa("me@acme.com:secret")}`);
  });

  it("builds a Bearer header for Data Center PATs", () => {
    const client = new JiraClient({
      baseUrl: "https://jira.local",
      pat: "token",
    });

    expect(client.isAuthenticated).toBe(true);
    expect(client.authHeader()).toBe("Bearer token");
  });

  it("is unauthenticated without credentials", () => {
    expect(
      new JiraClient({ baseUrl: "https://acme.atlassian.net" }).authHeader(),
    ).toBeNull();
  });

  it("follows every page of the enhanced search endpoint", async () => {
    const calls: Call[] = [];
    const pages = [
      {
        issues: [{ key: "A-1", fields: {} }],
        nextPageToken: "page-2",
      },
      {
        issues: [{ key: "A-2", fields: {} }],
        nextPageToken: "page-3",
      },
      { issues: [{ key: "A-3", fields: {} }] },
    ];

    const originalFetch = globalThis.fetch;
    globalThis.fetch = fakeFetch(pages, calls);
    try {
      const client = new JiraClient({
        baseUrl: "https://acme.atlassian.net",
        email: "me@acme.com",
        apiToken: "secret",
      });
      const issues = await client.searchIssues("project = A");
      expect(issues.map((issue) => issue.key)).toEqual(["A-1", "A-2", "A-3"]);
    } finally {
      globalThis.fetch = originalFetch;
    }

    expect(calls.length).toBe(3);
    expect(calls[0]?.url).toContain("/rest/api/3/search/jql");

    const firstBody = JSON.parse(String(calls[0]?.init?.body)) as Record<
      string,
      unknown
    >;
    expect(firstBody.jql).toBe("project = A");
    expect(firstBody.maxResults).toBe(SEARCH_PAGE_SIZE);
    expect(firstBody.nextPageToken).toBeUndefined();

    const secondBody = JSON.parse(String(calls[1]?.init?.body)) as Record<
      string,
      unknown
    >;
    expect(secondBody.nextPageToken).toBe("page-2");

    const auth = calls[0]?.init?.headers as Headers;
    expect(auth.get("Authorization")).toBe(
      `Basic ${btoa("me@acme.com:secret")}`,
    );
  });

  it("falls back to the classic search endpoint when the enhanced one is absent", async () => {
    const calls: Call[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
      const urlText = String(url);
      if (urlText.includes("/search/jql")) {
        calls.push({ url: urlText, init });
        return new Response(JSON.stringify({}), { status: 404 });
      }

      calls.push({ url: urlText, init });
      const startAt = new URL(urlText).searchParams.get("startAt");
      return new Response(
        JSON.stringify({
          issues: [{ key: "A-1", fields: {} }],
          startAt: startAt ? Number(startAt) : 0,
          maxResults: 100,
          total: 1,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };

    try {
      const client = new JiraClient({
        baseUrl: "https://old-jira.local",
        pat: "token",
      });
      const issues = await client.searchIssues("project = A");
      expect(issues.map((issue) => issue.key)).toEqual(["A-1"]);
    } finally {
      globalThis.fetch = originalFetch;
    }

    expect(calls[0]?.url).toContain("/rest/api/3/search/jql");
    expect(calls[1]?.url).toContain("/rest/api/3/search?");
    expect(calls[1]?.url).toContain("fields=*all");
  });

  it("describes auth failures clearly", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ errorMessages: ["Bad credentials"] }), {
        status: 401,
      })) as typeof fetch;
    try {
      const client = new JiraClient({
        baseUrl: "https://acme.atlassian.net",
        email: "me@acme.com",
        apiToken: "wrong",
      });
      await client.getMyself();
      expect.unreachable();
    } catch (error) {
      expect((error as Error).message).toMatch(/unauthorized/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
