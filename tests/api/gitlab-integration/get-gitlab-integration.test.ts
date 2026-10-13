import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

vi.mock("../../../apps/api/src/database", () => ({
  default: {
    query: {
      integrationTable: { findFirst: m.findFirst, findMany: m.findMany },
    },
          id: "integration-1",
          projectId: "project-1",
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          config: JSON.stringify({
            baseUrl: "https://gitlab.com",
            accessToken: "glpat-abcdefghijklmnop",
            projectPath: "acme/web",
            webhookSecret: "webhook-secret",
          }),
        }),
      },
    },
  },
}));

const {
  default: getGitlabIntegration,
  getGitlabIntegrationById,

describe("getGitlabIntegrationById secrets", () => {
  it("returns no token hint or webhook secret to other members", async () => {
    const integration = await getGitlabIntegrationById("integration-1");

    expect(integration?.maskedAccessToken).toBe("");
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
    expect(
      integrations.map((integration) => integration.webhookSecret),
    ).toEqual(["webhook-secret", "webhook-secret"]);
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
