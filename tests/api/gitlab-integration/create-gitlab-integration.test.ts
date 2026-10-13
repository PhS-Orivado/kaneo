import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const m = vi.hoisted(() => ({
  config: vi.fn(),
  verify: vi.fn(),
  getProject: vi.fn(),
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
vi.mock("../../../apps/api/src/plugins/gitlab/utils/gitlab-api", () => ({
  GitlabApiError: class extends Error {},
  verifyGitlabToken: m.verify,
  createGitlabClient: () => ({ getProject: m.getProject }),
}));
const { default: createGitlabIntegration } =
  await import("../../../apps/api/src/gitlab-integration/controllers/create-gitlab-integration");
const input = {
  projectId: "project",
  baseUrl: "https://gitlab.example",
  accessToken: undefined,
  tokenType: "private" as const,
  projectPath: "Acme/Platform/Web",
};
beforeEach(() => {
  vi.clearAllMocks();
  m.config.mockResolvedValue({
    id: "integration",
    config: JSON.stringify({
      baseUrl: "https://gitlab.example/",
      accessToken: "saved-token",
    }),
  });
  m.verify.mockResolvedValue({ id: 1 });
  m.getProject.mockResolvedValue({});
  m.quota.mockResolvedValue(undefined);
  m.insertReturning.mockResolvedValue([
    { id: "integration-2", projectId: "project", isActive: true },
  ]);
});

describe("gitlab reconnect credentials", () => {
  it("rejects a changed destination before sending the saved token", async () => {
    await expect(
      createGitlabIntegration({
        ...input,
        baseUrl: "https://attacker.example",
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(m.verify).not.toHaveBeenCalled();
    expect(m.getProject).not.toHaveBeenCalled();
    expect(m.insert).not.toHaveBeenCalled();
  });
  it("reuses credentials only for the same normalized destination", async () => {
    await createGitlabIntegration(input);
    expect(m.verify).toHaveBeenCalledWith(
      "https://gitlab.example",
      "saved-token",
      "private",
    );
  });
  it("allows a changed destination with an explicitly supplied token", async () => {
    await createGitlabIntegration({
      ...input,
      baseUrl: "https://new-gitlab.example",
      accessToken: " new-token ",
    });
    expect(m.verify).toHaveBeenCalledWith(
      "https://new-gitlab.example",
      "new-token",
      "private",
    );
  });
  it("rejects invalid saved configuration without contacting a provider", async () => {
    m.config.mockResolvedValue({ id: "integration", config: "{" });
    const error = await createGitlabIntegration(input).then(
      () => {
        throw new Error("expected the missing token to be rejected");
      },
      (rejected) => rejected,
    );
    expect(error).toMatchObject({ status: 400 });
    expect(m.verify).not.toHaveBeenCalled();
  });
});

describe("gitlab repository binding (RFC 0001 WP4)", () => {
  it("inserts one binding row keyed by the normalized repository identity", async () => {
    await createGitlabIntegration(input);
    expect(m.quota).toHaveBeenCalledWith("project", "workspace");
    expect(m.insert.mock.calls[0][0]).toMatchObject({
      projectId: "project",
      type: "gitlab",
      // The key lowercases the whole namespaced path; the derived owner and
      // name columns are display conveniences and keep their original case.
      repositoryKey: "gitlab:https://gitlab.example/acme/platform/web",
      repositoryOwner: "Acme",
      repositoryName: "Web",
      baseUrl: "https://gitlab.example",
      isActive: true,
    });
    const config = JSON.parse(m.insert.mock.calls[0][0].config);
    expect(config.baseUrl).toBe("https://gitlab.example");
    expect(config.projectPath).toBe("Acme/Platform/Web");
    expect(config.webhookSecret).toMatch(/^[0-9a-f]{48}$/);
  });
  it("generates a fresh webhook secret per binding instead of reusing one", async () => {
    await createGitlabIntegration(input);
    await createGitlabIntegration(input);
    const first = JSON.parse(m.insert.mock.calls[0][0].config).webhookSecret;
    const second = JSON.parse(m.insert.mock.calls[1][0].config).webhookSecret;
    expect(first).toMatch(/^[0-9a-f]{48}$/);
    expect(second).toMatch(/^[0-9a-f]{48}$/);
    expect(second).not.toBe(first);
  });
  it("never scans existing gitlab rows for cross-project conflicts (decision D1)", async () => {
    await createGitlabIntegration(input);
    expect(m.scan).not.toHaveBeenCalled();
  });
  it("refuses the insert when the plan's binding quota is exceeded", async () => {
    m.quota.mockRejectedValueOnce({ status: 402 });
    await expect(createGitlabIntegration(input)).rejects.toMatchObject({
      status: 402,
    });
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
});
