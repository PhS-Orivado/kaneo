import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const m = vi.hoisted(() => ({
  config: vi.fn(),
  verify: vi.fn(),
  getRepo: vi.fn(),
  quota: vi.fn(),
  insert: vi.fn(),
  insertReturning: vi.fn(),
  scan: vi.fn(),
}));
vi.mock("../../../apps/api/src/database", () => ({
  default: {
    query: {
      projectTable: {
        findFirst: async () => ({ id: "project", workspaceId: "workspace" }),
      },
      integrationTable: { findFirst: m.config, findMany: m.scan },
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
// before the insert; the wiring itself is covered by the plan-limits tests.
vi.mock("../../../apps/api/src/plan-limits/repository-binding-quota", () => ({
  assertRepositoryBindingQuota: m.quota,
  countActiveRepositoryBindings: vi.fn(async () => 0),
  getRepositoryBindingUsage: vi.fn(async () => ({ used: 0, limit: null })),
}));
vi.mock("../../../apps/api/src/plugins/gitea/utils/gitea-api", () => ({
  GiteaApiError: class extends Error {},
  verifyGiteaToken: m.verify,
  createGiteaClient: () => ({ getRepo: m.getRepo }),
}));
const { default: createGiteaIntegration } =
  await import("../../../apps/api/src/gitea-integration/controllers/create-gitea-integration");
const input = {
  projectId: "project",
  baseUrl: "https://gitea.example",
  accessToken: undefined,
  repositoryOwner: "owner",
  repositoryName: "repo",
};
beforeEach(() => {
  vi.clearAllMocks();
  m.config.mockResolvedValue({
    id: "integration",
    config: JSON.stringify({
      baseUrl: "https://gitea.example/",
      accessToken: "saved-token",
    }),
  });
  m.verify.mockResolvedValue({ id: 1 });
  m.getRepo.mockResolvedValue({});
  m.quota.mockResolvedValue(undefined);
  m.insertReturning.mockResolvedValue([
    { id: "integration-2", projectId: "project", isActive: true },
  ]);
});

describe("gitea reconnect credentials", () => {
  it("rejects a changed destination before sending the saved token", async () => {
    await expect(
      createGiteaIntegration({ ...input, baseUrl: "https://attacker.example" }),
    ).rejects.toMatchObject({ status: 400 });
    expect(m.verify).not.toHaveBeenCalled();
    expect(m.getRepo).not.toHaveBeenCalled();
    expect(m.insert).not.toHaveBeenCalled();
  });
  it("reuses credentials only for the same normalized destination", async () => {
    await createGiteaIntegration(input);
    expect(m.verify).toHaveBeenCalledWith(
      "https://gitea.example",
      "saved-token",
    );
  });
  it("allows a changed destination with an explicitly supplied token", async () => {
    await createGiteaIntegration({
      ...input,
      baseUrl: "https://new-gitea.example",
      accessToken: " new-token ",
    });
    expect(m.verify).toHaveBeenCalledWith(
      "https://new-gitea.example",
      "new-token",
    );
  });
  it("rejects invalid saved configuration without contacting a provider", async () => {
    m.config.mockResolvedValue({ id: "integration", config: "{" });
    await expect(createGiteaIntegration(input)).rejects.toMatchObject({
      status: 400,
    });
    expect(m.verify).not.toHaveBeenCalled();
  });
});

describe("gitea repository binding (RFC 0001 WP3)", () => {
  it("inserts one binding row keyed by the normalized repository identity", async () => {
    await createGiteaIntegration(input);
    expect(m.quota).toHaveBeenCalledWith("project", "workspace");
    expect(m.insert.mock.calls[0][0]).toMatchObject({
      projectId: "project",
      type: "gitea",
      repositoryKey: "gitea:https://gitea.example/owner/repo",
      repositoryOwner: "owner",
      repositoryName: "repo",
      isActive: true,
    });
    const config = JSON.parse(m.insert.mock.calls[0][0].config);
    expect(config.baseUrl).toBe("https://gitea.example");
    expect(config.webhookSecret).toMatch(/^[0-9a-f]{48}$/);
  });
  it("generates a fresh webhook secret per binding instead of reusing one", async () => {
    await createGiteaIntegration(input);
    await createGiteaIntegration(input);
    const first = JSON.parse(m.insert.mock.calls[0][0].config).webhookSecret;
    const second = JSON.parse(m.insert.mock.calls[1][0].config).webhookSecret;
    expect(first).toMatch(/^[0-9a-f]{48}$/);
    expect(second).toMatch(/^[0-9a-f]{48}$/);
    expect(second).not.toBe(first);
  });
  it("never scans existing gitea rows for cross-project conflicts (decision D1)", async () => {
    await createGiteaIntegration(input);
    expect(m.scan).not.toHaveBeenCalled();
  });
  it("refuses the insert when the plan's binding quota is exceeded", async () => {
    m.quota.mockRejectedValueOnce({ status: 402 });
    await expect(createGiteaIntegration(input)).rejects.toMatchObject({
      status: 402,
    });
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
});
