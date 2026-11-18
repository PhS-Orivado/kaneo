import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import db, { schema } from "../../apps/api/src/database";
import { gitlabRepositoryKey } from "../../apps/api/src/gitlab-integration/controllers/create-gitlab-integration";
import { createApp } from "../../apps/api/src/index";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";

// RFC 0001 WP4: the GitLab binding surface mirrors the Gitea one, keyed by
// integration id, with a per-row webhook token (X-Gitlab-Token) instead of a
// signature. These suites cover multi-project-path bindings, the
// same-project 409 mapping, cross-project sharing (decision D1), per-row
// webhook tokens, secret exposure limits, and delete isolation.

const m = vi.hoisted(() => ({
  verify: vi.fn(),
  getProject: vi.fn(),
}));
vi.mock("../../apps/api/src/plugins/gitlab/utils/gitlab-api", () => ({
  GitlabApiError: class extends Error {
    constructor(
      message: string,
      public status: number,
      public kind: string,
      public body?: string,
    ) {
      super(message);
      this.name = "GitlabApiError";
    }
  },
  gitlabFetch: vi.fn(),
  tokenTypeOf: (config: { tokenType?: string }) =>
    config.tokenType === "bearer" ? "bearer" : "private",
  createGitlabClient: () => ({ getProject: m.getProject }),
  verifyGitlabToken: m.verify,
}));

beforeEach(async () => {
  await resetTestDatabase();
  vi.clearAllMocks();
  m.getProject.mockResolvedValue({
    id: 1,
    path_with_namespace: "acme/platform/web",
  });
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

function createGitlabBinding(
  app: ReturnType<typeof createApp>["app"],
  projectId: string,
  projectPath: string,
  baseUrl = "https://gitlab.example",
) {
  return app.request(`/api/gitlab-integration/project/${projectId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      baseUrl,
      accessToken: "token",
      projectPath,
    }),
  });
}

function insertGitlabBinding(
  projectId: string,
  projectPath: string,
  webhookSecret: string,
) {
  return db
    .insert(schema.integrationTable)
    .values({
      projectId,
      type: "gitlab",
      isActive: true,
      repositoryKey: gitlabRepositoryKey("https://gitlab.example", projectPath),
      repositoryOwner: projectPath.split("/")[0],
      repositoryName: projectPath.split("/").at(-1),
      baseUrl: "https://gitlab.example",
      config: JSON.stringify({
        baseUrl: "https://gitlab.example",
        accessToken: "stored-token",
        tokenType: "private",
        projectPath,
        webhookSecret,
      }),
    })
    .returning();
}

describe("GitLab repository binding routes (RFC 0001 WP4)", () => {
  it("links two project paths to one project and isolates deletion", async () => {
    const { owner, project } = await ownerWithProject();
    mockAuthenticatedSession(owner.user);
    const { app } = createApp();
    const first = (await (
      await createGitlabBinding(app, project.id, "acme/platform/web")
    ).json()) as { id: string; webhookSecret: string };
    const second = (await (
      await createGitlabBinding(app, project.id, "acme/platform/api")
    ).json()) as { id: string; webhookSecret: string };
    expect(first.webhookSecret).not.toBe(second.webhookSecret);
    const bindings = await db.query.integrationTable.findMany();
    expect(bindings).toHaveLength(2);
    const firstRow = bindings.find((binding) => binding.id === first.id);
    expect(firstRow?.repositoryKey).toBe(
      gitlabRepositoryKey("https://gitlab.example", "acme/platform/web"),
    );
    // Display-convenience identity columns: top-level group and final path
    // segment (WP4); the full path is preserved in the key.
    expect(firstRow?.repositoryOwner).toBe("acme");
    expect(firstRow?.repositoryName).toBe("web");

    const deleted = await app.request(
      `/api/gitlab-integration/integration/${first.id}`,
      { method: "DELETE" },
    );
    expect(deleted.status).toBe(200);
    expect(
      (await deleted.json()) satisfies { success: boolean },
    ).toMatchObject({ success: true });
    expect(await db.query.integrationTable.findMany()).toHaveLength(1);
    expect(
      await db.query.integrationTable.findFirst({
        where: eq(schema.integrationTable.id, second.id),
      }),
    ).toBeDefined();
  });

  it("maps a same-project duplicate create to a 409 with the documented code", async () => {
    const { owner, project } = await ownerWithProject();
    mockAuthenticatedSession(owner.user);
    const { app } = createApp();
    expect(
      (await createGitlabBinding(app, project.id, "acme/platform/web")).status,
    ).toBe(200);
    const duplicate = await createGitlabBinding(
      app,
      project.id,
      "ACME/Platform/Web",
    );
    expect(duplicate.status).toBe(409);
    expect(await duplicate.json()).toMatchObject({
      code: "repository_already_linked",
      projectId: project.id,
      type: "gitlab",
    });
    const bindings = await db.query.integrationTable.findMany();
    expect(bindings).toHaveLength(1);
    expect(bindings[0]?.repositoryKey).toBe(
      gitlabRepositoryKey("https://gitlab.example", "acme/platform/web"),
    );
  });

  it("permits the same project path in a second project (decision D1)", async () => {
    const first = await ownerWithProject();
    const second = await ownerWithProject();
    mockAuthenticatedSession(first.owner.user);
    const { app } = createApp();
    expect(
      (await createGitlabBinding(app, first.project.id, "acme/team/web"))
        .status,
    ).toBe(200);
    mockAuthenticatedSession(second.owner.user);
    expect(
      (await createGitlabBinding(app, second.project.id, "acme/team/web"))
        .status,
    ).toBe(200);
    const bindings = await db.query.integrationTable.findMany();
    expect(bindings).toHaveLength(2);
    expect(new Set(bindings.map((b) => b.repositoryKey)).size).toBe(1);
    expect(
      new Set(bindings.map((b) => JSON.parse(b.config).webhookSecret)).size,
    ).toBe(2);
  });

  it("validates webhook deliveries per row with each binding's own token", async () => {
    const { project } = await ownerWithProject();
    const [first] = await insertGitlabBinding(
      project.id,
      "acme/platform/web",
      "test-only-webhook-secret",
    );
    const [second] = await insertGitlabBinding(
      project.id,
      "acme/platform/api",
      "other-test-only-secret",
    );
    const { app } = createApp();
    const body = JSON.stringify({ object_kind: "ping" });
    const deliver = (integrationId: string, token: string) =>
      app.request(`/api/gitlab-integration/webhook/${integrationId}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-gitlab-token": token,
        },
        body,
      });
    expect((await deliver(first!.id, "test-only-webhook-secret")).status).toBe(
      200,
    );
    // Binding one's token must not authorize deliveries to binding two.
    expect(
      (await deliver(second!.id, "test-only-webhook-secret")).status,
    ).toBe(400);
    expect((await deliver(second!.id, "other-test-only-secret")).status).toBe(
      200,
    );
    expect((await deliver(first!.id, "other-test-only-secret")).status).toBe(
      400,
    );
  });

  it("hides the webhook secret from callers without manage_settings", async () => {
    const { owner, project } = await ownerWithProject();
    await insertGitlabBinding(
      project.id,
      "acme/platform/web",
      "test-only-webhook-secret",
    );
    const member = await addWorkspaceMember(owner.workspace.id, "member");
    const { app } = createApp();
    mockAuthenticatedSession(member);
    const memberResponse = await app.request(
      `/api/gitlab-integration/project/${project.id}`,
    );
    expect(memberResponse.status).toBe(200);
    expect(await memberResponse.json()).toMatchObject({
      webhookSecret: "",
      maskedAccessToken: "",
    });
    mockAuthenticatedSession(owner.user);
    const ownerResponse = await app.request(
      `/api/gitlab-integration/project/${project.id}`,
    );
    expect(ownerResponse.status).toBe(200);
    expect(
      ((await ownerResponse.json()) as { webhookSecret: string })
        .webhookSecret,
    ).toBe("test-only-webhook-secret");
  });

  it("denies id-keyed routes to members and foreign workspaces", async () => {
    const { owner, project } = await ownerWithProject();
    const [binding] = await insertGitlabBinding(
      project.id,
      "acme/platform/web",
      "test-only-webhook-secret",
    );
    const member = await addWorkspaceMember(owner.workspace.id, "member");
    const outsider = await createWorkspaceMember({ role: "owner" });
    const { app } = createApp();
    const idCalls = (integrationId: string) =>
      [
        [
          `/api/gitlab-integration/integration/${integrationId}`,
          { method: "GET" },
        ],
        [
          `/api/gitlab-integration/integration/${integrationId}`,
          {
            method: "PATCH",
            body: JSON.stringify({ isActive: false }),
          },
        ],
        [
          `/api/gitlab-integration/integration/${integrationId}`,
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
        await app.request("/api/gitlab-integration/integration/unknown", {
          method: "GET",
        })
      ).status,
    ).toBe(404);
  });
});
