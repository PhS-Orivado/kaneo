import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const m = vi.hoisted(() => ({
  findFirst: vi.fn(),
  findMany: vi.fn(),
}));
vi.mock("../../../apps/api/src/database", () => ({
  default: {
    query: {
      integrationTable: { findFirst: m.findFirst, findMany: m.findMany },
    },
  },
}));

const {
  default: getGitlabIntegration,
  getGitlabIntegrationById,
  listGitlabIntegrations,
} = await import("../../../apps/api/src/gitlab-integration/controllers/get-gitlab-integration");

function row(id: string) {
  return {
    id,
    projectId: "project-1",
    type: "gitlab",
    baseUrl: "https://gitlab.example",
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    config: JSON.stringify({
      baseUrl: "https://gitlab.example",
      accessToken: "glpat-abcdefghijklmnop",
      tokenType: "private",
      projectPath: "acme/web",
      webhookSecret: "webhook-secret",
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  m.findFirst.mockResolvedValue(row("integration-1"));
  m.findMany.mockResolvedValue([row("integration-1"), row("integration-2")]);
});

// RFC 0001 WP4: the masked token hint is not a secret and is always present;
// the webhook secret is per row and only travels to settings managers.
describe("gitlab integration secret gating", () => {
  it("always masks the access token and hides the webhook secret from other members", async () => {
    const integration = await getGitlabIntegration("project-1");
    expect(integration?.maskedAccessToken).toBe("glpa••••••mnop");
    expect(integration?.webhookSecret).toBe("");
  });

  it("returns the webhook secret to settings managers without exposing the token", async () => {
    const integration = await getGitlabIntegration("project-1", true);
    expect(integration?.maskedAccessToken).toBe("glpa••••••mnop");
    expect(integration?.webhookSecret).toBe("webhook-secret");
  });
});

describe("listGitlabIntegrations (RFC 0001 WP4)", () => {
  it("maps every binding of the project, hiding secrets by default", async () => {
    const integrations = await listGitlabIntegrations("project-1");
    expect(integrations).toHaveLength(2);
    expect(integrations[0]).toMatchObject({
      id: "integration-1",
      projectId: "project-1",
      baseUrl: "https://gitlab.example",
      projectPath: "acme/web",
      maskedAccessToken: "glpa••••••mnop",
      webhookSecret: "",
    });
    expect(integrations[1]).toMatchObject({ id: "integration-2" });
  });

  it("includes each row's own webhook secret for settings managers", async () => {
    const integrations = await listGitlabIntegrations("project-1", true);
    expect(integrations.map((integration) => integration.webhookSecret)).toEqual(
      ["webhook-secret", "webhook-secret"],
    );
  });
});

describe("getGitlabIntegrationById (RFC 0001 WP4)", () => {
  it("resolves a binding by id with its per-row webhook route", async () => {
    const integration = await getGitlabIntegrationById("integration-1", true);
    expect(integration).toMatchObject({
      id: "integration-1",
      projectId: "project-1",
      webhookSecret: "webhook-secret",
      maskedAccessToken: "glpa••••••mnop",
    });
    expect(integration?.webhookUrl).toBe(
      "http://localhost:1337/api/gitlab-integration/webhook/integration-1",
    );
  });

  it("returns null for an unknown id", async () => {
    m.findFirst.mockResolvedValue(undefined);
    expect(await getGitlabIntegrationById("missing")).toBeNull();
  });
});
