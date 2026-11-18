import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";

// RFC 0001 WP2/WP3: a repository can be bound by several projects at once
// (decision D1), while each project keeps at most one binding per repository
// (unique constraint integration_project_type_repo_unique). These suites
// drive both rules through concurrent create requests, the way webhooks and
// several browser tabs hit the API in production.

const m = vi.hoisted(() => ({
  verify: vi.fn(),
  getRepo: vi.fn(),
}));
vi.mock("../../apps/api/src/plugins/gitea/utils/gitea-api", () => ({
  GiteaApiError: class extends Error {
    constructor(
      message: string,
      public status: number,
      public kind: string,
      public body?: string,
    ) {
      super(message);
      this.name = "GiteaApiError";
    }
  },
  giteaFetch: vi.fn(),
  createGiteaClient: () => ({ getRepo: m.getRepo }),
  verifyGiteaToken: m.verify,
}));

beforeEach(async () => {
  await resetTestDatabase();
  vi.clearAllMocks();
});

function createGiteaBinding(
  app: ReturnType<typeof createApp>["app"],
  projectId: string,
  repositoryName: string,
) {
  return app
    .request(`/api/gitea-integration/project/${projectId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        baseUrl: "https://git.example",
        accessToken: "token",
        repositoryOwner: "acme",
        repositoryName,
      }),
    })
    .then(async (response) => ({
      status: response.status,
      body: (await response.json()) as {
        id?: string;
        webhookSecret?: string;
        code?: string;
      },
    }));
}

describe("Concurrent repository binding creates (RFC 0001 WP2/WP3)", () => {
  it("lets two projects bind the same repository concurrently (D1)", async () => {
    const member = await createWorkspaceMember({ role: "owner" });
    const first = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    const second = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const [a, b] = await Promise.all([
      createGiteaBinding(app, first.project.id, "web"),
      createGiteaBinding(app, second.project.id, "web"),
    ]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);

    const rows = await db.query.integrationTable.findMany();
    expect(rows).toHaveLength(2);
    // One shared repository key across projects, but per-row webhook secrets.
    expect(new Set(rows.map((row) => row.repositoryKey))).toEqual(
      new Set(["gitea:https://git.example/acme/web"]),
    );
    const secrets = new Set(
      rows.map(
        (row) => JSON.parse(row.config).webhookSecret as string,
      ),
    );
    expect(secrets.size).toBe(2);
  });

  it("keeps exactly one binding per project and repository under a same-project race", async () => {
    const member = await createWorkspaceMember({ role: "owner" });
    const { project } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const results = await Promise.all([
      createGiteaBinding(app, project.id, "web"),
      createGiteaBinding(app, project.id, "web"),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
    const refused = results.find((result) => result.status === 409);
    expect(refused?.body).toMatchObject({
      code: "repository_already_linked",
      projectId: project.id,
      type: "gitea",
    });
    const rows = await db.query.integrationTable.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.projectId).toBe(project.id);
  });
});
