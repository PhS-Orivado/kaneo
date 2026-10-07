import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const m = vi.hoisted(() => ({
  saved: vi.fn(),
  verify: vi.fn(),
  getRepo: vi.fn(),
  quota: vi.fn(),
  insert: vi.fn(),
  insertReturning: vi.fn(),
}));
vi.mock("../../../apps/api/src/database", () => ({
  default: {
    query: {
      projectTable: {
        findFirst: async () => ({ id: "project", workspaceId: "workspace" }),
      },
      integrationTable: { findFirst: m.saved },
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
  GiteaApiError: class extends Error {},
  verifyGiteaToken: m.verify,
  createGiteaClient: () => ({ getRepo: m.getRepo }),
}));
const { default: reconnect } = await import(
  "../../../apps/api/src/gitea-integration/controllers/create-gitea-integration"
);
const input = {
  projectId: "project",
  baseUrl: "https://gitea.example",
  accessToken: undefined,
  repositoryOwner: "owner",
  repositoryName: "repo",
};
beforeEach(() => {
  vi.clearAllMocks();
  m.saved.mockResolvedValue({
    id: "integration",
    config: JSON.stringify({
      baseUrl: "https://gitea.example/",
      accessToken: "saved-token",
    }),
  });
  m.verify.mockResolvedValue(undefined);
  m.getRepo.mockResolvedValue(undefined);
  m.quota.mockResolvedValue(undefined);
  m.insertReturning.mockResolvedValue([
    { id: "integration", projectId: "project", isActive: true },
  ]);
});
describe("gitea reconnect credentials", () => {
  it("rejects a changed destination before sending the saved token", async () => {
    await expect(
      reconnect({ ...input, baseUrl: "https://attacker.example" }),
    ).rejects.toMatchObject({ status: 400 });
    expect(m.verify).not.toHaveBeenCalled();
    expect(m.getRepo).not.toHaveBeenCalled();
    expect(m.insert).not.toHaveBeenCalled();
  });
  it("reuses credentials only for the same normalized destination, then creates a new binding", async () => {
    await reconnect(input);
    expect(m.verify).toHaveBeenCalledWith(
      "https://gitea.example",
      "saved-token",
    );
    // RFC 0001 WP3: reconnecting inserts a new binding row (with a fresh
    // webhook secret) instead of updating the stored one in place.
    expect(m.insert).toHaveBeenCalledTimes(1);
    expect(m.insert.mock.calls[0][0]).toMatchObject({
      projectId: "project",
      type: "gitea",
    });
  });
  it("allows a changed destination with an explicitly supplied token", async () => {
    await reconnect({
      ...input,
      baseUrl: "https://new-gitea.example",
      accessToken: " new-token ",
    });
    expect(m.verify).toHaveBeenCalledWith(
      "https://new-gitea.example",
      "new-token",
    );
    expect(m.insert).toHaveBeenCalledTimes(1);
  });
  it("rejects invalid saved configuration without contacting a provider", async () => {
    m.saved.mockResolvedValue({ id: "integration", config: "{" });
    await expect(reconnect(input)).rejects.toMatchObject({ status: 400 });
    expect(m.verify).not.toHaveBeenCalled();
    expect(m.insert).not.toHaveBeenCalled();
  });
});
