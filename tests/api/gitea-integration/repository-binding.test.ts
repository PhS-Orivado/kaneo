import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const m = vi.hoisted(() => ({
  project: vi.fn(),
  saved: vi.fn(),
  integrations: vi.fn(),
  verify: vi.fn(),
  getRepo: vi.fn(),
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
vi.mock("../../../apps/api/src/plugins/gitea/utils/gitea-api", () => ({
  GiteaApiError: class GiteaApiError extends Error {
    status: number | undefined;
    constructor(message: string, status?: number) {
      super(message);
      this.status = status;
    }
  },
  verifyGiteaToken: m.verify,
  createGiteaClient: () => ({ getRepo: m.getRepo }),
}));
const { default: createGiteaIntegration, giteaRepositoryKey } =
  await import("../../../apps/api/src/gitea-integration/controllers/create-gitea-integration");

const input = {
  projectId: "project",
  baseUrl: "https://gitea.example",
  accessToken: "token",
  repositoryOwner: "Owner",
  repositoryName: "Repo",
};

beforeEach(() => {
  vi.clearAllMocks();
  m.project.mockResolvedValue({ id: "project", workspaceId: "workspace" });
  m.saved.mockResolvedValue(null);
  m.verify.mockResolvedValue(undefined);
  m.getRepo.mockResolvedValue(undefined);
  m.quota.mockResolvedValue(undefined);
  m.insertReturning.mockResolvedValue([
    { id: "integration", projectId: "project", isActive: true },
  ]);
});

describe("Gitea repository linking (RFC 0001 WP3)", () => {
  it("inserts one binding row keyed by the normalized repository identity", async () => {
    const created = await createGiteaIntegration(input);
    expect(m.insert.mock.calls[0][0]).toMatchObject({
      projectId: "project",
      type: "gitea",
      repositoryKey: "gitea:https://gitea.example/owner/repo",
      repositoryOwner: "Owner",
      repositoryName: "Repo",
      isActive: true,
    });
    const config = JSON.parse(m.insert.mock.calls[0][0].config);
    expect(config).toMatchObject({
      baseUrl: "https://gitea.example",
      accessToken: "token",
      repositoryOwner: "Owner",
      repositoryName: "Repo",
    });
    expect(config.webhookSecret).toMatch(/^[0-9a-f]{48}$/);
    expect(created).toMatchObject({
      id: "integration",
      baseUrl: "https://gitea.example",
      repositoryOwner: "Owner",
      repositoryName: "Repo",
    });
    expect(created.webhookSecret).toBe(config.webhookSecret);
  });

  it("generates a fresh webhook secret for every binding", async () => {
    await createGiteaIntegration(input);
    await createGiteaIntegration({ ...input, repositoryName: "Other" });
    expect(m.insert).toHaveBeenCalledTimes(2);
    const [first, second] = m.insert.mock.calls.map(
      (call) => JSON.parse(call[0].config).webhookSecret,
    );
    expect(first).toMatch(/^[0-9a-f]{48}$/);
    expect(second).toMatch(/^[0-9a-f]{48}$/);
    expect(first).not.toBe(second);
  });

  it("enforces the repository binding quota before the insert", async () => {
    m.quota.mockRejectedValueOnce(
      Object.assign(new Error("Repository binding limit reached"), {
        status: 402,
      }),
    );
    await expect(createGiteaIntegration(input)).rejects.toMatchObject({
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
    const error = await createGiteaIntegration(input).then(
      () => {
        throw new Error("expected the duplicate insert to be rejected");
      },
      (rejected) => rejected,
    );
    expect(error.status).toBe(409);
    expect(JSON.parse(await error.getResponse().text())).toMatchObject({
      code: "repository_already_linked",
      projectId: "project",
      type: "gitea",
    });
  });

  it("rethrows unique violations of other constraints unchanged", async () => {
    const otherConstraint = {
      code: "23505",
      constraint: "integration_project_type_null_repo_unique",
    };
    m.insertReturning.mockRejectedValueOnce(otherConstraint);
    const error = await createGiteaIntegration(input).then(
      () => {
        throw new Error("expected the insert failure to propagate");
      },
      (rejected) => rejected,
    );
    expect(error).toBe(otherConstraint);
  });

  it("rejects an unknown project before contacting the provider", async () => {
    m.project.mockResolvedValue(null);
    await expect(createGiteaIntegration(input)).rejects.toMatchObject({
      status: 404,
    });
    expect(m.verify).not.toHaveBeenCalled();
    expect(m.insert).not.toHaveBeenCalled();
  });

  it("maps provider failures to their upstream status without inserting", async () => {
    const { GiteaApiError } =
      await import("../../../apps/api/src/plugins/gitea/utils/gitea-api");
    m.verify.mockRejectedValueOnce(new GiteaApiError("Invalid token", 401));
    await expect(createGiteaIntegration(input)).rejects.toMatchObject({
      status: 401,
    });
    expect(m.insert).not.toHaveBeenCalled();
  });

  it("does not scan the instance's gitea bindings (decision D1)", async () => {
    await createGiteaIntegration(input);
    expect(m.integrations).not.toHaveBeenCalled();
  });

  it("derives the repository key from normalized lowercased coordinates", () => {
    expect(giteaRepositoryKey("https://gitea.example", "Owner", "Repo")).toBe(
      "gitea:https://gitea.example/owner/repo",
    );
  });
});
