import { createHmac, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import db, { schema } from "../../apps/api/src/database";
import { giteaRepositoryKey } from "../../apps/api/src/gitea-integration/controllers/create-gitea-integration";
import { createApp } from "../../apps/api/src/index";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";

// RFC 0001 WP3: the Gitea binding surface is keyed by integration id and
// allows several repositories per project. These suites cover the binding
// HTTP routes a real database can decide: multi-binding inserts, the
// same-project 409 mapping, cross-project sharing (decision D1), per-row
// webhook secrets, secret exposure limits, the quota guard (WP10), and
// delete isolation including the external link cascade.

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
  getRepository: vi.fn(),
  createGiteaClient: () => ({ getRepo: m.getRepo }),
  verifyGiteaToken: m.verify,
}));

beforeEach(async () => {
  await resetTestDatabase();
  vi.clearAllMocks();
});

async function addWorkspaceMember(
  workspaceId: string,
  role: "member" | "viewer",
) {
  const userId = `user-${randomUUID()}`;
  const [user] = await db
    .insert(schema.userTable)
    .values({
      id: userId,
      email: `${userId}@example.com`,
      emailVerified: true,
      name: "Workspace Test User",
    })
    .returning();
  await db.insert(schema.workspaceUserTable).values({
    workspaceId,
    userId,
    role,
    joinedAt: new Date(),
  });
  return user;
}

async function ownerWithProject() {
  const member = await createWorkspaceMember({ role: "owner" });
  const { project, columns } = await createProjectFixture({
    workspaceId: member.workspace.id,
  });
  return { owner: member, project, columns };
}

function createGiteaBinding(
  app: ReturnType<typeof createApp>["app"],
  projectId: string,
  repositoryOwner: string,
  repositoryName: string,
  baseUrl = "https://git.example",
) {
  return app.request(`/api/gitea-integration/project/${projectId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      baseUrl,
      accessToken: "token",
      repositoryOwner,
      repositoryName,
    }),
  });
}

function insertGiteaBinding(
  projectId: string,
  repositoryOwner: string,
  repositoryName: string,
  webhookSecret: string,
) {
  return db
    .insert(schema.integrationTable)
    .values({
      projectId,
      type: "gitea",
      isActive: true,
      repositoryKey: giteaRepositoryKey(
        "https://git.example",
        repositoryOwner,
        repositoryName,
      ),
      repositoryOwner,
      repositoryName,
      baseUrl: "https://git.example",
      config: JSON.stringify({
        baseUrl: "https://git.example",
        accessToken: "stored-token",
        webhookSecret,
        repositoryOwner,
        repositoryName,
      }),
    })
    .returning();
}

describe("Gitea repository binding routes (RFC 0001 WP3)", () => {
  it("links two repositories to one project and isolates deletion", async () => {
    const { owner, project, columns } = await ownerWithProject();
    mockAuthenticatedSession(owner.user);
    const { app } = createApp();
    const first = (await (
      await createGiteaBinding(app, project.id, "acme", "alpha")
    ).json()) as { id: string; webhookSecret: string };
    const second = (await (
      await createGiteaBinding(app, project.id, "acme", "beta")
    ).json()) as { id: string; webhookSecret: string };
    expect(first.webhookSecret).not.toBe(second.webhookSecret);
    const bindings = await db.query.integrationTable.findMany();
    expect(bindings).toHaveLength(2);

    // Deleting one binding removes its external links and leaves the sibling
    // fully addressable; tasks created from the deleted repository's issues
    // remain in the project.
    const [task] = await db
      .insert(schema.taskTable)
      .values({
        projectId: project.id,
        number: 1,
        title: "Imported issue",
        status: "to-do",
        columnId: columns.todo.id,
        priority: "medium",
        position: 1,
      })
      .returning();
    await db.insert(schema.externalLinkTable).values([
      {
        taskId: task!.id,
        integrationId: first.id,
        resourceType: "issue",
        externalId: "1",
        url: "https://git.example/acme/alpha/issues/1",
      },
      {
        taskId: task!.id,
        integrationId: second.id,
        resourceType: "issue",
        externalId: "1",
        url: "https://git.example/acme/beta/issues/1",
      },
    ]);
    const deleted = await app.request(
      `/api/gitea-integration/integration/${first.id}`,
      { method: "DELETE" },
    );
    expect(deleted.status).toBe(200);
    expect(await db.query.integrationTable.findMany()).toHaveLength(1);
    expect(
      await db.query.externalLinkTable.findMany({
        where: eq(schema.externalLinkTable.taskId, task!.id),
      }),
    ).toMatchObject([{ integrationId: second.id }]);
    const sibling = await app.request(
      `/api/gitea-integration/integration/${second.id}`,
      { method: "GET" },
    );
    expect(sibling.status).toBe(200);
    expect(
      await db.query.taskTable.findFirst({
        where: eq(schema.taskTable.id, task!.id),
      }),
    ).toMatchObject({ title: "Imported issue" });
  });

  it("maps a same-project duplicate create to a 409 with the documented code", async () => {
    const { owner, project } = await ownerWithProject();
    mockAuthenticatedSession(owner.user);
    const { app } = createApp();
    expect(
      (await createGiteaBinding(app, project.id, "ACME", "Alpha")).status,
    ).toBe(200);
    // The same repository in different casing (owner and name fold to
    // lowercased key coordinates) is the same repository key.
    const duplicate = await createGiteaBinding(
      app,
      project.id,
      "acme",
      "alpha",
      "https://git.example/",
    );
    expect(duplicate.status).toBe(409);
    expect(await duplicate.json()).toMatchObject({
      code: "repository_already_linked",
      projectId: project.id,
      type: "gitea",
    });
    const bindings = await db.query.integrationTable.findMany();
    expect(bindings).toHaveLength(1);
    expect(bindings[0]?.repositoryKey).toBe(
      giteaRepositoryKey("https://git.example", "acme", "alpha"),
    );
  });

  it("permits the same repository in a second project (decision D1)", async () => {
    const first = await ownerWithProject();
    const second = await ownerWithProject();
    mockAuthenticatedSession(first.owner.user);
    const { app } = createApp();
    expect(
      (await createGiteaBinding(app, first.project.id, "acme", "alpha")).status,
    ).toBe(200);
    mockAuthenticatedSession(second.owner.user);
    const crossProject = await createGiteaBinding(
      app,
      second.project.id,
      "acme",
      "alpha",
    );
    expect(crossProject.status).toBe(200);
    const bindings = await db.query.integrationTable.findMany();
    expect(bindings).toHaveLength(2);
    expect(new Set(bindings.map((b) => b.repositoryKey)).size).toBe(1);
    expect(
      new Set(bindings.map((b) => JSON.parse(b.config).webhookSecret)).size,
    ).toBe(2);
  });

  it("verifies webhook deliveries per row with each binding's own secret", async () => {
    const { project } = await ownerWithProject();
    const [first] = await insertGiteaBinding(
      project.id,
      "owner",
      "repo",
      "test-only-webhook-secret",
    );
    const [second] = await insertGiteaBinding(
      project.id,
      "owner",
      "other",
      "other-test-only-secret",
    );
    const { app } = createApp();
    const body = JSON.stringify({ ref: "refs/heads/main" });
    const deliver = (integrationId: string, secret: string) =>
      app.request(`/api/gitea-integration/webhook/${integrationId}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-gitea-event": "ping",
          "x-gitea-signature": createHmac("sha256", secret)
            .update(body)
            .digest("hex"),
        },
        body,
      });
    expect((await deliver(first!.id, "test-only-webhook-secret")).status).toBe(
      200,
    );
    // Binding one's secret must not authorize deliveries to binding two.
    expect(
      (await deliver(second!.id, "test-only-webhook-secret")).status,
    ).toBe(400);
    expect((await deliver(second!.id, "other-test-only-secret")).status).toBe(
      200,
    );
    // A delivery signed by binding two's secret is refused on binding one.
    expect((await deliver(first!.id, "other-test-only-secret")).status).toBe(
      400,
    );
  });

  it("hides the webhook secret from callers without manage_settings", async () => {
    const { owner, project } = await ownerWithProject();
    await insertGiteaBinding(
      project.id,
      "owner",
      "repo",
      "test-only-webhook-secret",
    );
    const member = await addWorkspaceMember(owner.workspace.id, "member");
    const { app } = createApp();
    mockAuthenticatedSession(member);
    const memberResponse = await app.request(
      `/api/gitea-integration/project/${project.id}`,
    );
    expect(memberResponse.status).toBe(200);
    expect(await memberResponse.json()).toMatchObject({
      webhookSecret: "",
    });
    mockAuthenticatedSession(owner.user);
    const ownerResponse = await app.request(
      `/api/gitea-integration/project/${project.id}`,
    );
    expect(ownerResponse.status).toBe(200);
    expect(
      ((await ownerResponse.json()) as { webhookSecret: string })
        .webhookSecret,
    ).toBe("test-only-webhook-secret");
  });

  it("enforces the workspace repository binding quota and reports usage", async () => {
    const { owner, project } = await ownerWithProject();
    await db.insert(schema.workspaceLimitTable).values({
      workspaceId: owner.workspace.id,
      maxRepositoriesPerProject: 1,
    });
    mockAuthenticatedSession(owner.user);
    const { app } = createApp();
    expect(
      (await createGiteaBinding(app, project.id, "acme", "alpha")).status,
    ).toBe(200);
    const refused = await createGiteaBinding(app, project.id, "acme", "beta");
    expect(refused.status).toBe(402);
    expect(await refused.json()).toMatchObject({
      code: "binding_limit_exceeded",
      used: 1,
      limit: 1,
    });
    const list = await app.request(
      `/api/gitea-integration/project/${project.id}/integrations`,
    );
    expect(list.status).toBe(200);
    expect(await list.json()).toMatchObject({ usage: { used: 1, limit: 1 } });
  });

  it("denies id-keyed routes to members and foreign workspaces", async () => {
    const { owner, project } = await ownerWithProject();
    const [binding] = await insertGiteaBinding(
      project.id,
      "owner",
      "repo",
      "test-only-webhook-secret",
    );
    const member = await addWorkspaceMember(owner.workspace.id, "member");
    const outsider = await createWorkspaceMember({ role: "owner" });
    const { app } = createApp();
    const idCalls = (integrationId: string) =>
      [
        [
          `/api/gitea-integration/integration/${integrationId}`,
          { method: "GET" },
        ],
        [
          `/api/gitea-integration/integration/${integrationId}`,
          {
            method: "PATCH",
            body: JSON.stringify({ isActive: false }),
          },
        ],
        [
          `/api/gitea-integration/integration/${integrationId}`,
          { method: "DELETE" },
        ],
      ] as const;
    for (const [user, status] of [
      [member, 403],
      [outsider.user, 404],
    ] as const) {
      mockAuthenticatedSession(user);
      for (const [url, options] of idCalls(binding!.id)) {
        const response = await app.request(url, {
          ...options,
          headers: { "Content-Type": "application/json" },
        });
        expect(response.status).toBe(status);
      }
    }
    mockAuthenticatedSession(owner.user);
    expect(
      (
        await app.request("/api/gitea-integration/integration/unknown", {
          method: "GET",
        })
      ).status,
    ).toBe(404);
  });

  it("persists a binding only after token and repository verification", async () => {
    const { owner, project } = await ownerWithProject();
    mockAuthenticatedSession(owner.user);
    const { app } = createApp();
    m.getRepo.mockRejectedValueOnce(new Error("network failed"));
    const response = await createGiteaBinding(
      app,
      project.id,
      "acme",
      "alpha",
    );
    expect(m.verify).toHaveBeenCalledWith("https://git.example", "token");
    expect(m.getRepo).toHaveBeenCalledWith("acme", "alpha");
    expect(response.status).toBe(500);
    expect(await db.query.integrationTable.findMany()).toHaveLength(0);
  });
});
