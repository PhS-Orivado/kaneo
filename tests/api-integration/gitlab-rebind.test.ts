import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import db, { schema } from "../../apps/api/src/database";
import createGitlabIntegration, {
  gitlabRepositoryKey,
} from "../../apps/api/src/gitlab-integration/controllers/create-gitlab-integration";
import { createApp } from "../../apps/api/src/index";
import {
  normalizeGitlabBaseUrl,
  normalizeProjectPath,
} from "../../apps/api/src/plugins/gitlab/config";
import { handleGitlabWebhookRequest } from "../../apps/api/src/plugins/gitlab/webhook-handler";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";

const { verify } = vi.hoisted(() => ({ verify: vi.fn() }));
vi.mock(
  "../../apps/api/src/plugins/gitlab/utils/gitlab-api",
  async (original) => ({
    // Keep the real module exports (tokenTypeOf, GitlabApiError, ...) so the
    // enrichment path of the list route works; only the network calls are
    // stubbed.
    ...(await original<
      typeof import("../../apps/api/src/plugins/gitlab/utils/gitlab-api")
    >()),
    verifyGitlabToken: verify,
    createGitlabClient: () => ({ getProject: async () => ({}) }),
  }),
);
beforeEach(async () => {
  await resetTestDatabase();
  verify.mockReset().mockResolvedValue({ id: 1 });
});

async function setup() {
  const member = await createWorkspaceMember({ role: "admin" });
  const { project } = await createProjectFixture({
    workspaceId: member.workspace.id,
  });
  const [integration] = await db
    .insert(schema.integrationTable)
    .values({
      projectId: project.id,
      type: "gitlab",
      // RFC 0001 WP4: a legacy binding row already carrying its repository
      // identity key and its own webhook secret.
      repositoryKey: "gitlab:https://gitlab.example/team/repo",
      repositoryOwner: "team",
      repositoryName: "repo",
      baseUrl: "https://gitlab.example",
      isActive: true,
      config: JSON.stringify({
        baseUrl: "https://gitlab.example",
        accessToken: "legacy-token",
        tokenType: "private",
        projectPath: "team/repo",
        webhookSecret: "legacy-hook",
      }),
    })
    .returning();
  const connect = (projectPath: string) =>
    createGitlabIntegration({
      projectId: project.id,
      baseUrl: "https://gitlab.example",
      accessToken: "new-token",
      tokenType: "private",
      projectPath,
    });
  mockAuthenticatedSession(member.user);
  const { app } = createApp();
  return { member, project, integration, connect, app };
}

describe("GitLab repository binding semantics (RFC 0001 WP4)", () => {
  it("rejects relinking the same GitLab project with the documented 409 code", async () => {
    const { project, integration, connect } = await setup();
    const error = await connect("team/repo").then(
      () => {
        throw new Error("expected the duplicate link to be rejected");
      },
      (rejected) => rejected,
    );
    expect(error.status).toBe(409);
    expect(JSON.parse(await error.getResponse().text())).toMatchObject({
      code: "repository_already_linked",
      projectId: project.id,
      type: "gitlab",
    });
    const rows = await db.query.integrationTable.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: integration.id,
      repositoryKey: "gitlab:https://gitlab.example/team/repo",
      config: integration.config,
    });
  });

  it("links a different GitLab project as an additional binding without touching the first", async () => {
    const { project, integration, connect } = await setup();
    const next = await connect("team/other");
    expect(next.id).not.toBe(integration.id);
    expect(next).toMatchObject({
      projectPath: "team/other",
      baseUrl: "https://gitlab.example",
      isActive: true,
    });
    // One fresh secret per binding, never copied from the legacy row.
    expect(next.webhookSecret).toMatch(/^[0-9a-f]{48}$/);
    expect(next.webhookSecret).not.toBe("legacy-hook");
    const rows = await db.query.integrationTable.findMany({
      where: eq(schema.integrationTable.projectId, project.id),
    });
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.repositoryKey).sort()).toEqual([
      "gitlab:https://gitlab.example/team/other",
      "gitlab:https://gitlab.example/team/repo",
    ]);
    const fresh = rows.find((row) => row.id !== integration.id)!;
    expect(JSON.parse(fresh.config).webhookSecret).toBe(next.webhookSecret);
    expect(JSON.parse(fresh.config).webhookSecret).not.toBe("legacy-hook");
    expect(
      (
        await db.query.integrationTable.findFirst({
          where: eq(schema.integrationTable.id, integration.id),
        })
      )?.config,
    ).toBe(integration.config);
  });

  it("permits the same GitLab project in a second project with independent webhook delivery (decision D1)", async () => {
    const first = await setup();
    const secondMember = await createWorkspaceMember({ role: "admin" });
    const { project: otherProject } = await createProjectFixture({
      workspaceId: secondMember.workspace.id,
    });
    const second = await createGitlabIntegration({
      projectId: otherProject.id,
      baseUrl: "https://gitlab.example",
      accessToken: "token",
      tokenType: "private",
      projectPath: "team/repo",
    });
    expect(second.id).not.toBe(first.integration.id);
    expect(second.webhookSecret).not.toBe("legacy-hook");

    // Each binding's webhook route verifies with its own secret, so the two
    // projects never interfere.
    const payload = JSON.stringify({
      object_kind: "pipeline",
      project: {},
      object_attributes: {},
    });
    expect(
      await handleGitlabWebhookRequest(
        first.integration.id,
        payload,
        "legacy-hook",
      ),
    ).toEqual({ success: true });
    expect(
      await handleGitlabWebhookRequest(
        first.integration.id,
        payload,
        second.webhookSecret,
      ),
    ).toMatchObject({ success: false, error: "Invalid webhook token" });
    expect(
      await handleGitlabWebhookRequest(
        second.id,
        payload,
        second.webhookSecret,
      ),
    ).toEqual({ success: true });
    expect(
      await handleGitlabWebhookRequest(second.id, payload, "legacy-hook"),
    ).toMatchObject({ success: false, error: "Invalid webhook token" });
  });

  it("derives the repository key exactly as the WP0 backfill SQL does", async () => {
    const { workspace } = await createWorkspaceMember();
    const cases = [
      { baseUrl: "https://gitlab.example/", projectPath: "acme/platform/web" },
      { baseUrl: "https://gitlab.example", projectPath: "Acme/Platform/Web" },
      {
        baseUrl: "https://gitlab.example",
        projectPath: "group/subgroup/project",
      },
    ];
    for (const { baseUrl, projectPath } of cases) {
      const normalizedBase = normalizeGitlabBaseUrl(baseUrl);
      const normalizedPath = normalizeProjectPath(projectPath);
      const { project } = await createProjectFixture({
        workspaceId: workspace.id,
      });
      const [row] = await db
        .insert(schema.integrationTable)
        .values({
          projectId: project.id,
          type: "gitlab",
          repositoryKey: gitlabRepositoryKey(normalizedBase, normalizedPath),
          config: JSON.stringify({
            baseUrl: normalizedBase,
            accessToken: "token",
            projectPath: normalizedPath,
          }),
        })
        .returning();
      const result = await db.execute<{ key: string }>(sql`
        select 'gitlab:' || (config::jsonb ->> 'baseUrl') || '/'
          || lower(config::jsonb ->> 'projectPath') as key
        from integration
        where id = ${row!.id}
      `);
      expect(result.rows[0].key).toBe(
        gitlabRepositoryKey(normalizedBase, normalizedPath),
      );
      expect(result.rows[0].key).toBe(row!.repositoryKey);
    }
  });

  it("rejects a foreign-workspace administrator on the id-keyed routes", async () => {
    const { integration, app } = await setup();
    const outsider = await createWorkspaceMember({ role: "admin" });
    mockAuthenticatedSession(outsider.user);
    const response = await app.request(
      `/api/gitlab-integration/integration/${integration.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commentTaskLinkOnGitlabIssue: true }),
      },
    );
    expect(response.status).toBe(403);
  });

  it("enforces the workspace repository binding quota and reports its usage (RFC 0001 WP10)", async () => {
    const { member, project, integration, connect, app } = await setup();
    await db.insert(schema.workspaceLimitTable).values({
      workspaceId: member.workspace.id,
      maxRepositoriesPerProject: 1,
    });
    const error = await connect("team/other").then(
      () => {
        throw new Error("expected the quota to be enforced");
      },
      (rejected) => rejected,
    );
    expect(error.status).toBe(402);
    expect(JSON.parse(await error.getResponse().text())).toMatchObject({
      code: "binding_limit_exceeded",
      used: 1,
      limit: 1,
    });
    expect(
      (
        await db.query.integrationTable.findMany({
          where: eq(schema.integrationTable.projectId, project.id),
        })
      ),
    ).toHaveLength(1);

    mockAuthenticatedSession(member.user);
    const response = await app.request(
      `/api/gitlab-integration/project/${project.id}/integrations`,
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.integrations).toHaveLength(1);
    expect(body.integrations[0]).toMatchObject({
      id: integration.id,
      webhookSecret: "legacy-hook",
    });
    expect(body.usage).toEqual({ used: 1, limit: 1 });
  });

  it("leaves exactly one row when two concurrent creates race for the same path", async () => {
    const { project, connect } = await setup();
    const results = await Promise.allSettled([
      connect("team/other"),
      connect("team/other"),
    ]);
    const rejected = results.filter(
      (result) => result.status === "rejected",
    ) as PromiseRejectedResult[];
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatchObject({ status: 409 });
    const rows = await db.query.integrationTable.findMany({
      where: eq(schema.integrationTable.projectId, project.id),
    });
    expect(rows).toHaveLength(2);
  });
});
