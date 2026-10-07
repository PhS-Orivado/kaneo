import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const m = vi.hoisted(() => ({
  project: vi.fn(),
  saved: vi.fn(),
  integrations: vi.fn(),
  verify: vi.fn(),
  getProject: vi.fn(),
  quota: vi.fn(),
  insert: vi.fn(),
  insertReturning: vi.fn(),
}));
vi.mock("../../../apps/api/src/database", () => ({
  default: {
    query: {
      projectTable: { findFirst: m.project },
      integrationTable: { findFirst: m.saved, findMany: m.integrations },
    },
    insert: () => ({
      values: (data: unknown) => {
        m.insert(data);
        return { returning: m.insertReturning };
      },
    }),
  },
}));
// RFC 0001 WP10: the create controller enforces the repository binding quota
// before the insert; the wiring itself is covered by the plan-limits tests
// (tests/api/plan-limits/repository-binding-quota.test.ts).
vi.mock("../../../apps/api/src/plan-limits/repository-binding-quota", () => ({
  assertRepositoryBindingQuota: m.quota,
  countActiveRepositoryBindings: vi.fn(async () => 0),
  getRepositoryBindingUsage: vi.fn(async () => ({ used: 0, limit: null })),
}));
vi.mock("../../../apps/api/src/plugins/gitlab/utils/gitlab-api", () => ({
  GitlabApiError: class GitlabApiError extends Error {
    status: number | undefined;
    constructor(message: string, status?: number) {
      super(message);
      this.status = status;
    }
  },
  verifyGitlabToken: m.verify,
  createGitlabClient: () => ({ getProject: m.getProject }),
}));
const { default: createGitlabIntegration, gitlabRepositoryKey } =
  await import("../../../apps/api/src/gitlab-integration/controllers/create-gitlab-integration");

const input = {
  projectId: "project",
  baseUrl: "https://gitlab.example",
  accessToken: "token",
  tokenType: "private",
  projectPath: "Acme/Web",
};

beforeEach(() => {
  vi.clearAllMocks();
  m.project.mockResolvedValue({ id: "project", workspaceId: "workspace" });
  m.saved.mockResolvedValue(null);
  m.verify.mockResolvedValue({ id: 1 });
  m.getProject.mockResolvedValue({});
  m.quota.mockResolvedValue(undefined);
  m.insertReturning.mockResolvedValue([
    { id: "integration", projectId: "project", isActive: true },
  ]);
});

describe("GitLab repository linking (RFC 0001 WP4)", () => {
  it("inserts one binding row keyed by the normalized repository identity", async () => {
    const created = await createGitlabIntegration(input);
    expect(m.insert.mock.calls[0][0]).toMatchObject({
      projectId: "project",
      type: "gitlab",
      repositoryKey: "gitlab:https://gitlab.example/acme/web",
      repositoryOwner: "Acme",
      repositoryName: "Web",
      baseUrl: "https://gitlab.example",
      isActive: true,
    });
    const config = JSON.parse(m.insert.mock.calls[0][0].config);
    expect(config).toMatchObject({
      baseUrl: "https://gitlab.example",
      accessToken: "token",
      projectPath: "Acme/Web",
    });
    expect(config.webhookSecret).toMatch(/^[0-9a-f]{48}$/);
    expect(created).toMatchObject({
      id: "integration",
      baseUrl: "https://gitlab.example",
      projectPath: "Acme/Web",
    });
    expect(created.webhookSecret).toBe(config.webhookSecret);
  });

  it("generates a fresh webhook secret for every binding", async () => {
    await createGitlabIntegration(input);
    await createGitlabIntegration({ ...input, projectPath: "Acme/Other" });
    expect(m.insert).toHaveBeenCalledTimes(2);
    const [first, second] = m.insert.mock.calls.map(
      (call) => JSON.parse(call[0].config).webhookSecret,
    );
    expect(first).toMatch(/^[0-9a-f]{48}$/);
    expect(second).toMatch(/^[0-9a-f]{48}$/);
    expect(first).not.toBe(second);
  });

  it("normalizes a trailing-slash base URL before deriving the repository key", async () => {
    await createGitlabIntegration({
      ...input,
      baseUrl: "https://gitlab.example/",
    });
    expect(m.insert.mock.calls[0][0]).toMatchObject({
      repositoryKey: "gitlab:https://gitlab.example/acme/web",
      baseUrl: "https://gitlab.example",
    });
  });

  it("enforces the repository binding quota before the insert", async () => {
    m.quota.mockRejectedValueOnce(
      Object.assign(new Error("Repository binding limit reached"), {
        status: 402,
      }),
    );
    await expect(createGitlabIntegration(input)).rejects.toMatchObject({
      status: 402,
    });
    expect(m.quota).toHaveBeenCalledWith("project", "workspace");
    expect(m.insert).not.toHaveBeenCalled();
  });

  it("maps a same-project duplicate insert to a 409 with the documented code", async () => {
    m.insertReturning.mockRejectedValueOnce({
      code: "23505",
      constraint: "integration_project_type_repo_unique",
    });
    const error = await createGitlabIntegration(input).then(
      () => {
        throw new Error("expected the duplicate insert to be rejected");
      },
      (rejected) => rejected,
    );
    expect(error.status).toBe(409);
    expect(JSON.parse(await error.getResponse().text())).toMatchObject({
      code: "repository_already_linked",
      projectId: "project",
      type: "gitlab",
    });
  });

  it("rethrows unique violations of other constraints unchanged", async () => {
    const otherConstraint = {
      code: "23505",
      constraint: "integration_project_type_null_repo_unique",
    };
    m.insertReturning.mockRejectedValueOnce(otherConstraint);
    const error = await createGitlabIntegration(input).then(
      () => {
        throw new Error("expected the insert failure to propagate");
      },
      (rejected) => rejected,
    );
    expect(error).toBe(otherConstraint);
  });

  it("rejects an unknown project before contacting the provider", async () => {
    m.project.mockResolvedValue(null);
    await expect(createGitlabIntegration(input)).rejects.toMatchObject({
      status: 404,
    });
    expect(m.verify).not.toHaveBeenCalled();
    expect(m.insert).not.toHaveBeenCalled();
  });

  it("maps provider failures to their upstream status without inserting", async () => {
    const { GitlabApiError } =
      await import("../../../apps/api/src/plugins/gitlab/utils/gitlab-api");
    m.verify.mockRejectedValueOnce(new GitlabApiError("Invalid token", 401));
    await expect(createGitlabIntegration(input)).rejects.toMatchObject({
      status: 401,
    });
    expect(m.insert).not.toHaveBeenCalled();
  });

  it("does not scan the instance's gitlab bindings (decision D1)", async () => {
    await createGitlabIntegration(input);
    expect(m.integrations).not.toHaveBeenCalled();
  });

  it("derives repository keys byte-identical to the WP0 SQL backfill", () => {
    // Backfill: 'gitlab:' || baseUrl || '/' || lower(projectPath), with the
    // stored base URL normalized. Covers nested subgroups and mixed casing.
    expect(
      gitlabRepositoryKey("https://gitlab.example", "Acme/Platform/Web"),
    ).toBe("gitlab:https://gitlab.example/acme/platform/web");
    expect(gitlabRepositoryKey("https://gitlab.example", "ACME/WEB")).toBe(
      "gitlab:https://gitlab.example/acme/web",
    );
  });
});
