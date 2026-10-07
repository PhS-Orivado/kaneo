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
    installationId: 1,
    repositoryId: 2,
    verifiedGithubAccountId: "3",
    verifiedByUserId: member.user.id,
    branchPattern: "feature/{slug}-{number}",
    commentTaskLinkOnGitHubIssue: false,
  };
  const [integration] = await db
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
  verify.mockResolvedValue({
    repositoryOwner: "owner",
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
    const rows = await db.query.integrationTable.findMany();
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.repositoryKey).sort()).toEqual([
      "github:2",
      "github:99",
    ]);
    expect(await db.query.externalLinkTable.findFirst()).toMatchObject(link);
    expect(await db.query.githubImportTable.findFirst()).toBeDefined();
  });

  it("permits relinking after disconnect without reusing old links or import cursors", async () => {
    const { config, integration, task, connect } = await setup();
    await deleteIntegration(integration.id);
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
    expect(await db.query.externalLinkTable.findMany()).toHaveLength(0);
    expect(await db.query.githubImportTable.findMany()).toHaveLength(0);
    expect(await db.query.taskTable.findFirst()).toMatchObject({ id: task.id });
  });

  it("rejects a concurrent settings change instead of overwriting the new config", async () => {
    const { config, integration, app } = await setup();
    const nextConfig = JSON.stringify({
      ...config,
      repositoryId: 99,
      repositoryName: "new",
    });
    const find = db.query.integrationTable.findFirst.bind(
      db.query.integrationTable,
    );
    let flipped = false;
    const spy = vi
      .spyOn(db.query.integrationTable, "findFirst")
      .mockImplementation(async (...args: Parameters<typeof find>) => {
        const row = await find(...args);
        // The fromIntegration access middleware resolves the binding with a
        // plain select, so the PATCH handler's row read is the first
        // findFirst on the integration table. Changing the config between
        // the read and the compare-and-set yields 409.
        if (!flipped && row?.id === integration.id) {
          flipped = true;
          await db
            .update(schema.integrationTable)
            .set({ config: nextConfig })
            .where(eq(schema.integrationTable.id, integration.id));
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
