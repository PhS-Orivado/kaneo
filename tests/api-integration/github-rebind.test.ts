import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import db, { schema } from "../../apps/api/src/database";
import createIntegration from "../../apps/api/src/github-integration/controllers/create-github-integration";
import deleteIntegration from "../../apps/api/src/github-integration/controllers/delete-github-integration";
import { initialImportState } from "../../apps/api/src/github-integration/import-state";
import { createApp } from "../../apps/api/src/index";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";

const { verify } = vi.hoisted(() => ({ verify: vi.fn() }));
vi.mock(
  "../../apps/api/src/github-integration/controllers/verify-repository-owner",
  () => ({
    verifyRepositoryOwner: verify,
  }),
);
// RFC 0001 WP10: the create controller enforces the repository binding quota
// before the insert; the quota wiring itself is covered by the plan-limits
// tests (tests/api/plan-limits/repository-binding-quota.test.ts).
vi.mock("../../apps/api/src/plan-limits/repository-binding-quota", () => ({
  assertRepositoryBindingQuota: vi.fn(async () => {}),
  countActiveRepositoryBindings: vi.fn(async () => 0),
  getRepositoryBindingUsage: vi.fn(async () => ({ used: 0, limit: null })),
}));
beforeEach(async () => {
  await resetTestDatabase();
  verify.mockReset();
});
async function setup() {
  const member = await createWorkspaceMember({ role: "admin" });
  const { project } = await createProjectFixture({
    workspaceId: member.workspace.id,
  });
  const config = {
    repositoryOwner: "owner",
    repositoryName: "repo",
    .insert(schema.integrationTable)
    .values({
      projectId: project.id,
      type: "github",
      // RFC 0001 WP2: the binding row carries its repository identity key.
      repositoryKey: "github:2",
      isActive: true,
      config: JSON.stringify(config),
    })
    .returning();
  const [task] = await db
    .insert(schema.taskTable)
    .values({ projectId: project.id, title: "Existing task", number: 1 })
    .returning();
  const [link] = await db
    .insert(schema.externalLinkTable)
    .values({
      taskId: task.id,
      integrationId: integration.id,
      resourceType: "issue",
      externalId: "1",
      url: "https://github.com/owner/repo/issues/1",
    })
    .returning();
  await db
    .insert(schema.githubImportTable)
    .values({ integrationId: integration.id, state: initialImportState(2) });
    repositoryName: "repo",
    repositoryId: 2,
    installationId: 1,
    verifiedGithubAccountId: "3",
    verifiedByUserId: member.user.id,
  });
  const connect = () =>
    createIntegration({
      userId: member.user.id,
      projectId: project.id,
      repositoryOwner: "owner",
      repositoryName: "repo",
    });
  mockAuthenticatedSession(member.user);
  const { app } = createApp();
  return { project, config, integration, task, link, connect, app };
}

describe("GitHub repository binding semantics (RFC 0001 WP2)", () => {
  it("rejects relinking the same repository with the documented 409 code", async () => {
    const { project, integration, link, connect } = await setup();
    const error = await connect().then(
      () => {
        throw new Error("expected the duplicate link to be rejected");
      },
      (rejected) => rejected,
    );
    expect(error.status).toBe(409);
    expect(JSON.parse(await error.getResponse().text())).toMatchObject({
      code: "repository_already_linked",
      projectId: project.id,
      type: "github",
    });
    expect(await db.query.integrationTable.findMany()).toHaveLength(1);
    expect(await db.query.integrationTable.findFirst()).toMatchObject({
      id: integration.id,
    });
    expect(await db.query.externalLinkTable.findFirst()).toMatchObject(link);
    expect(await db.query.githubImportTable.findFirst()).toBeDefined();
  });

  it("links a different repository as an additional binding without touching the first", async () => {
    const { config, integration, link, connect } = await setup();
    verify.mockResolvedValue({
      repositoryOwner: "owner",
      repositoryName: "other",
      repositoryId: 99,
      installationId: 1,
      verifiedGithubAccountId: "3",
      verifiedByUserId: config.verifiedByUserId,
    });
    const next = await connect();
    expect(next.id).not.toBe(integration.id);
    expect(next).toMatchObject({
      repositoryOwner: "owner",
      repositoryName: "other",
      isActive: true,
    });
      id: integration.id,
    });
    });
    expect(await db.query.externalLinkTable.findFirst()).toMatchObject(link);
    expect(await db.query.githubImportTable.findFirst()).toBeDefined();
  });

  it("links a different repository as an additional binding without touching the first", async () => {
    const { config, integration, link, connect } = await setup();
    verify.mockResolvedValue({
      repositoryOwner: "owner",
      repositoryName: "renamed",
      repositoryId: 2,
      installationId: 88,
      verifiedGithubAccountId: "3",
      verifiedByUserId: config.verifiedByUserId,
    });
    const next = await connect();
    expect(next.id).not.toBe(integration.id);
      repositoryName: "renamed",
      installationId: 88,
    });
    expect(
      JSON.parse((await db.query.integrationTable.findFirst())?.config ?? "{}"),
    ).toMatchObject({
      branchPattern: config.branchPattern,
      commentTaskLinkOnGitHubIssue: false,
      repositoryId: 2,
    });
    expect(await db.query.externalLinkTable.findFirst()).toMatchObject(link);
    expect(await db.query.githubImportTable.findFirst()).toBeDefined();
  });

  it("permits relinking after disconnect without reusing old links or import cursors", async () => {
    const legacy = {
      repositoryOwner: "OWNER",
      repositoryName: "REPO",
      installationId: 1,
    };
    await db
      .update(schema.integrationTable)
      .set({ config: JSON.stringify(legacy) })
      .where(eq(schema.integrationTable.id, integration.id));
    verify.mockResolvedValue({ ...config, repositoryName: "another" });
    await expect(connect()).rejects.toMatchObject({ status: 409 });
    verify.mockResolvedValue(config);
    await expect(connect()).resolves.toMatchObject({ id: integration.id });
  });
  it("requires an explicit disconnect when an existing configuration cannot establish repository identity", async () => {
    const { integration, connect } = await setup();
    await db
      .update(schema.integrationTable)
      .set({ config: "invalid" })
      .where(eq(schema.integrationTable.id, integration.id));
    await expect(connect()).rejects.toMatchObject({ status: 409 });
    expect(await db.query.externalLinkTable.findFirst()).toBeDefined();
  });
  it("permits switching after disconnect without reusing old links or import cursors", async () => {
    const { project, config, integration, task, connect } = await setup();
    await deleteIntegration(integration.id);
    verify.mockResolvedValue({
      ...config,
      repositoryId: 99,
      repositoryName: "other",
    });
    const next = await connect();
    expect(next.id).not.toBe(integration.id);
    expect(await db.query.externalLinkTable.findMany()).toHaveLength(0);
    expect(await db.query.githubImportTable.findMany()).toHaveLength(0);
    expect(await db.query.taskTable.findFirst()).toMatchObject({ id: task.id });
  });

  it("rejects a concurrent settings change instead of overwriting the new config", async () => {
    const { config, integration, app } = await setup();
    const nextConfig = JSON.stringify({
      ...config,
      repositoryId: 99,
        repositoryId: 99,
        repositoryName: "new",
      });
      const find = db.query.integrationTable.findFirst.bind(
        db.query.integrationTable,
      );
      const spy = vi
        .spyOn(db.query.integrationTable, "findFirst")
        .mockImplementationOnce(async (...args) => {
          const row = await find(...args);
          await db
            .update(schema.integrationTable)
            .set({ config: nextConfig })
            .where(eq(schema.integrationTable.id, integration.id));
        }
        return row;
      });
        if (operation === "reconnect")
          await expect(connect()).rejects.toMatchObject({ status: 409 });
        else {
          const response = await app.request(
            `/api/github-integration/integration/${integration.id}`,
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ commentTaskLinkOnGitHubIssue: true }),
            },
          );
          expect(response.status).toBe(409);
        }
        return row;
      });
    try {
      const response = await app.request(
        `/api/github-integration/integration/${integration.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ commentTaskLinkOnGitHubIssue: true }),
        },
      );
      expect(response.status).toBe(409);
    } finally {
      spy.mockRestore();
    }
    expect((await db.query.integrationTable.findFirst())?.config).toBe(
      nextConfig,
    );
  });
});
