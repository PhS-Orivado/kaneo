import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";

// RFC 0001 WP4: the gitlab API surface is keyed per repository binding. The
// provider client is mocked; every assertion runs against the real routes
// and database.
const provider = vi.hoisted(() => ({
  verifyGitlabToken: vi.fn(),
  getProject: vi.fn(),
  listIssues: vi.fn(),
  listMergeRequests: vi.fn(),
  listIssueNotes: vi.fn(),
}));
vi.mock(
  "../../apps/api/src/plugins/gitlab/utils/gitlab-api",
  async (original) => ({
    ...(await original<
      typeof import("../../apps/api/src/plugins/gitlab/utils/gitlab-api")
    >()),
    verifyGitlabToken: provider.verifyGitlabToken,
    createGitlabClient: () => ({
      getProject: provider.getProject,
      listIssues: provider.listIssues,
      listMergeRequests: provider.listMergeRequests,
      listIssueNotes: provider.listIssueNotes,
    }),
  }),
);

beforeEach(async () => {
  await resetTestDatabase();
  vi.clearAllMocks();
  provider.verifyGitlabToken.mockResolvedValue({ id: 1 });
  provider.getProject.mockResolvedValue({});
  provider.listIssues.mockResolvedValue([]);
  provider.listMergeRequests.mockResolvedValue([]);
  provider.listIssueNotes.mockResolvedValue([]);
});

async function adminWithProject() {
  const member = await createWorkspaceMember({ role: "admin" });
  const { project } = await createProjectFixture({
    workspaceId: member.workspace.id,
  });
  mockAuthenticatedSession(member.user);
  return { member, project };
}

async function addWorkspaceMember(workspaceId: string, role: string) {
  const id = `user-${randomUUID()}`;
  const [user] = await db
    .insert(schema.userTable)
    .values({
      id,
      email: `${id}@example.com`,
      emailVerified: true,
      name: "Integration Test User",
    })
    .returning();
  await db.insert(schema.workspaceUserTable).values({
    workspaceId,
    userId: user.id,
    role,
    joinedAt: new Date(),
  });
  return user;
}

function link(projectId: string, projectPath = "group/repo") {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      baseUrl: "https://gitlab.example",
      accessToken: "token",
      tokenType: "private",
      projectPath,
    }),
  };
}

describe("GitLab repository binding routes (RFC 0001 WP4)", () => {
  it("links two GitLab projects as separate bindings with distinct secrets", async () => {
    const { project } = await adminWithProject();
    const { app } = createApp();
    const first = await app.request(
      `/api/gitlab-integration/project/${project.id}`,
      link(project.id, "group/repo"),
    );
    const second = await app.request(
      `/api/gitlab-integration/project/${project.id}`,
      link(project.id, "group/other"),
    );
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const rows = await db.query.integrationTable.findMany();
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.repositoryKey).sort()).toEqual([
      "gitlab:https://gitlab.example/group/other",
      "gitlab:https://gitlab.example/group/repo",
    ]);
    const firstBody = await first.json();
    const secondBody = await second.json();
    expect(firstBody.webhookSecret).not.toBe(secondBody.webhookSecret);
    const listResponse = await app.request(
      `/api/gitlab-integration/project/${project.id}/integrations`,
    );
    expect(listResponse.status).toBe(200);
    const list = await listResponse.json();
    expect(list.integrations).toHaveLength(2);
    expect(list.usage).toMatchObject({ used: 2 });
  });

  it("rejects a duplicate same-project link with 409 repository_already_linked", async () => {
    const { project } = await adminWithProject();
    const { app } = createApp();
    expect(
      (
        await app.request(
          `/api/gitlab-integration/project/${project.id}`,
          link(project.id),
        )
      ).status,
    ).toBe(200);
    const duplicate = await app.request(
      `/api/gitlab-integration/project/${project.id}`,
      link(project.id),
    );
    expect(duplicate.status).toBe(409);
    expect(await duplicate.json()).toMatchObject({
      code: "repository_already_linked",
      projectId: project.id,
      type: "gitlab",
    });
    expect(await db.query.integrationTable.findMany()).toHaveLength(1);
  });

  it("shares one GitLab project across projects and isolates deletion (decision D1)", async () => {
    const { member, project } = await adminWithProject();
    const { project: otherProject } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    const { app } = createApp();
    expect(
      (
        await app.request(
          `/api/gitlab-integration/project/${project.id}`,
          link(project.id),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await app.request(
          `/api/gitlab-integration/project/${otherProject.id}`,
          link(otherProject.id),
        )
      ).status,
    ).toBe(200);
    const rows = await db.query.integrationTable.findMany();
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((row) => row.repositoryKey)).size).toBe(1);
    const [removed, survivor] = rows.map((row) => row.id);
    expect(
      (
        await app.request(`/api/gitlab-integration/integration/${removed}`, {
          method: "DELETE",
        })
      ).status,
    ).toBe(200);
    expect(await db.query.integrationTable.findMany()).toHaveLength(1);
    const detail = await app.request(
      `/api/gitlab-integration/integration/${survivor}`,
    );
    expect(detail.status).toBe(200);
    expect((await detail.json()).id).toBe(survivor);
  });

  it("verifies webhook deliveries per row with each binding's own secret", async () => {
    const { member, project } = await adminWithProject();
    const { project: otherProject } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    const { app } = createApp();
    await app.request(
      `/api/gitlab-integration/project/${project.id}`,
      link(project.id),
    );
    await app.request(
      `/api/gitlab-integration/project/${otherProject.id}`,
      link(otherProject.id),
    );
    const rows = await db.query.integrationTable.findMany();
    expect(rows).toHaveLength(2);
    const secrets = rows.map(
      (row) => JSON.parse(row.config).webhookSecret as string,
    );
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
    expect((await deliver(rows[0].id, secrets[0])).status).toBe(200);
    expect((await deliver(rows[1].id, secrets[1])).status).toBe(200);
    // A token from another binding of the same GitLab project must not verify.
    expect((await deliver(rows[0].id, secrets[1])).status).toBe(400);
  });

  it("rejects foreign-workspace callers and hides the secret from callers without manage_settings", async () => {
    const { member, project } = await adminWithProject();
    const { app } = createApp();
    await app.request(
      `/api/gitlab-integration/project/${project.id}`,
      link(project.id),
    );
    const [row] = await db.query.integrationTable.findMany();
    const outsider = await createWorkspaceMember({ role: "admin" });
    mockAuthenticatedSession(outsider.user);
    expect(
      (await app.request(`/api/gitlab-integration/integration/${row.id}`))
        .status,
    ).toBe(403);
    const viewer = await addWorkspaceMember(member.workspace.id, "viewer");
    await db.insert(schema.workspaceRoleTable).values({
      workspaceId: member.workspace.id,
      role: "viewer",
      permission: JSON.stringify({}),
    });
    mockAuthenticatedSession(viewer);
    expect(
      (await app.request(`/api/gitlab-integration/integration/${row.id}`))
        .status,
    ).toBe(403);
    const compat = await app.request(
      `/api/gitlab-integration/project/${project.id}`,
    );
    expect(compat.status).toBe(200);
    const compatBody = await compat.json();
    expect(compatBody.id).toBe(row.id);
    expect(compatBody.webhookSecret).toBe("");
    mockAuthenticatedSession(member.user);
    const adminDetail = await app.request(
      `/api/gitlab-integration/integration/${row.id}`,
    );
    expect(adminDetail.status).toBe(200);
    expect((await adminDetail.json()).webhookSecret).toBe(
      JSON.parse(row.config).webhookSecret,
    );
  });

  it("refuses bindings beyond the workspace plan limit (WP10)", async () => {
    const { member, project } = await adminWithProject();
    await db.insert(schema.workspaceLimitTable).values({
      workspaceId: member.workspace.id,
      maxRepositoriesPerProject: 1,
    });
    const { app } = createApp();
    expect(
      (
        await app.request(
          `/api/gitlab-integration/project/${project.id}`,
          link(project.id),
        )
      ).status,
    ).toBe(200);
    const refused = await app.request(
      `/api/gitlab-integration/project/${project.id}`,
      link(project.id, "group/other"),
    );
    expect(refused.status).toBe(402);
    expect(await refused.json()).toMatchObject({
      code: "binding_limit_exceeded",
      used: 1,
      limit: 1,
    });
    expect(await db.query.integrationTable.findMany()).toHaveLength(1);
  });

  it("keys issue imports by the binding id and accepts only its own project as compat", async () => {
    const { member, project } = await adminWithProject();
    const { project: otherProject } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    const { app } = createApp();
    await app.request(
      `/api/gitlab-integration/project/${project.id}`,
      link(project.id),
    );
    const [row] = await db.query.integrationTable.findMany();
    const imported = await app.request(
      "/api/gitlab-integration/import-issues",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ integrationId: row.id }),
      },
    );
    expect(imported.status).toBe(200);
    expect(await imported.json()).toMatchObject({
      imported: 0,
      updated: 0,
      skipped: 0,
    });
    expect(provider.listIssues).toHaveBeenCalledTimes(1);
    const mismatch = await app.request(
      "/api/gitlab-integration/import-issues",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          integrationId: row.id,
          projectId: otherProject.id,
        }),
      },
    );
    expect(mismatch.status).toBe(404);
  });
});
