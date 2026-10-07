import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import db, { schema } from "../../apps/api/src/database";
import * as events from "../../apps/api/src/events";
import { createApp } from "../../apps/api/src/index";
import { getSyncIntegrationById } from "../../apps/api/src/integration-sync/controllers/get-integration";
import { lockResumeScopeById } from "../../apps/api/src/integration-sync/controllers/lock-resume-scope";
import {
  defaultSyncRules,
  type SyncRules,
} from "../../apps/api/src/plugins/sync/rules";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";

// RFC 0001 WP5: the integration-sync surface is keyed by integration id. One
// repository binding owns its rules, preview tokens, paused links and resume
// locks; a sibling binding of the same project is never visible to a route or
// flow that addresses another binding. Every assertion runs against the real
// routes, controllers and database.
beforeEach(async () => {
  await resetTestDatabase();
  vi.spyOn(events, "publishEvent").mockResolvedValue(undefined);
});

type Binding = typeof schema.integrationTable.$inferSelect;

async function insertBinding(projectId: string, repositoryName: string) {
  const [row] = await db
    .insert(schema.integrationTable)
    .values({
      projectId,
      type: "gitea",
      isActive: true,
      // RFC 0001 WP0: two bindings of one project must carry distinct
      // repository keys; NULL keys would collide on
      // integration_project_type_null_repo_unique.
      repositoryKey: `gitea:https://git.example/team/${repositoryName}`,
      repositoryOwner: "team",
      repositoryName,
      baseUrl: "https://git.example",
      config: JSON.stringify({
        baseUrl: "https://git.example",
        accessToken: "test-only",
        repositoryOwner: "team",
        repositoryName,
        syncRules: defaultSyncRules,
      }),
    })
    .returning();
  return row!;
}

async function projectWithTwoBindings() {
  const member = await createWorkspaceMember({ role: "owner" });
  const { project, columns } = await createProjectFixture({
    workspaceId: member.workspace.id,
  });
  const first = await insertBinding(project.id, "repo-a");
  const second = await insertBinding(project.id, "repo-b");
  mockAuthenticatedSession(member.user);
  const { app } = createApp();
  return { member, project, columns, first, second, app };
}

const rulesFor = (label: string): SyncRules => ({
  ...defaultSyncRules,
  incoming: { mode: "labels", match: "all", labels: [label] },
});

const json = (body: unknown) => ({
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

async function previewOn(
  app: ReturnType<typeof createApp>["app"],
  integrationId: string,
  rules: SyncRules,
) {
  const response = await app.request(
    `/api/integration-sync/integration/${integrationId}/preview`,
    { method: "POST", ...json({ rules }) },
  );
  expect(response.status).toBe(200);
  return (await response.json()) as { previewToken: string; rules: SyncRules };
}

describe("Integration sync binding routes (RFC 0001 WP5)", () => {
  it("keys the sync surface by integration id and keeps two bindings' rule sets independent", async () => {
    const { project, first, second, app } = await projectWithTwoBindings();
    const rules = rulesFor("ready");

    const before = await app.request(
      `/api/integration-sync/integration/${first.id}`,
    );
    expect(before.status).toBe(200);
    expect((await before.json()).rules).toEqual(defaultSyncRules);

    const { previewToken } = await previewOn(app, first.id, rules);
    const save = await app.request(
      `/api/integration-sync/integration/${first.id}`,
      { method: "PATCH", ...json({ rules, previewToken }) },
    );
    expect(save.status).toBe(200);

    // The sibling binding keeps its own untouched rule set.
    const sibling = await app.request(
      `/api/integration-sync/integration/${second.id}`,
    );
    expect(sibling.status).toBe(200);
    expect((await sibling.json()).rules).toEqual(defaultSyncRules);
    const stored = await db.query.integrationTable.findFirst({
      where: eq(schema.integrationTable.id, second.id),
    });
    expect(JSON.parse(stored!.config).syncRules).toEqual(defaultSyncRules);
    const saved = await db.query.integrationTable.findFirst({
      where: eq(schema.integrationTable.id, first.id),
    });
    expect(JSON.parse(saved!.config).syncRules).toEqual(rules);

    expect(events.publishEvent).toHaveBeenCalledWith(
      "integration.sync_rules_changed",
      { projectId: project.id, integrationId: first.id },
    );
  });

  it("scopes preview tokens per binding and refuses a sibling's token", async () => {
    const { first, second, app } = await projectWithTwoBindings();
    const rules = rulesFor("ready");
    const firstToken = (await previewOn(app, first.id, rules)).previewToken;
    const secondToken = (await previewOn(app, second.id, rules)).previewToken;
    expect(firstToken).not.toBe(secondToken);

    const refused = await app.request(
      `/api/integration-sync/integration/${second.id}`,
      { method: "PATCH", ...json({ rules, previewToken: firstToken }) },
    );
    expect(refused.status).toBe(409);

    const accepted = await app.request(
      `/api/integration-sync/integration/${second.id}`,
      { method: "PATCH", ...json({ rules, previewToken: secondToken }) },
    );
    expect(accepted.status).toBe(200);
  });

  it("rejects foreign-workspace callers on every binding route and 404s unknown ids", async () => {
    const { first, app } = await projectWithTwoBindings();
    const outsider = await createWorkspaceMember({ role: "owner" });
    mockAuthenticatedSession(outsider.user);
    const token = "t".repeat(64);
    const requests: Array<[string, RequestInit]> = [
      [`/api/integration-sync/integration/${first.id}`, { method: "GET" }],
      [
        `/api/integration-sync/integration/${first.id}/preview`,
        { method: "POST", ...json({ rules: defaultSyncRules }) },
      ],
      [
        `/api/integration-sync/integration/${first.id}`,
        { method: "PATCH", ...json({ rules: defaultSyncRules, previewToken: token }) },
      ],
      [
        `/api/integration-sync/integration/${first.id}/links/link-1/review`,
        { method: "GET" },
      ],
      [
        `/api/integration-sync/integration/${first.id}/links/link-1/resume`,
        { method: "POST", ...json({ token, source: "kaneo" }) },
      ],
    ];
    for (const [url, init] of requests) {
      expect((await app.request(url, init)).status).toBe(403);
    }
    expect(
      (
        await app.request(`/api/integration-sync/integration/${randomUUID()}`)
      ).status,
    ).toBe(404);
  });

  it("resolves the first binding on the project-keyed compat routes", async () => {
    const { project, first, second, app } = await projectWithTwoBindings();
    const rules = rulesFor("ready");
    const { previewToken } = await previewOn(app, first.id, rules);
    expect(
      (
        await app.request(`/api/integration-sync/integration/${first.id}`, {
          method: "PATCH",
          ...json({ rules, previewToken }),
        })
      ).status,
    ).toBe(200);

    // The compat route addresses the first binding (lowest createdAt), which
    // is the one whose rules were just saved.
    const compat = await app.request(
      `/api/integration-sync/project/${project.id}/gitea`,
    );
    expect(compat.status).toBe(200);
    expect((await compat.json()).rules).toEqual(rules);

    // The sibling binding keeps its default rules, and a provider without a
    // binding stays a 404 on the compat surface.
    const sibling = await getSyncIntegrationById(second.id);
    expect(JSON.parse(sibling.config).syncRules).toEqual(defaultSyncRules);
    expect(
      (
        await app.request(
          `/api/integration-sync/project/${project.id}/github`,
        )
      ).status,
    ).toBe(404);
  });

  it("locks the resume scope per binding and never sees a sibling binding's links", async () => {
    const { member, project, columns, first, second } =
      await projectWithTwoBindings();
    const pausedLink = async (binding: Binding, number: number) => {
      const [task] = await db
        .insert(schema.taskTable)
        .values({
          projectId: project.id,
          title: "Paused task",
          number,
          status: "to-do",
          columnId: columns.todo.id,
        })
        .returning();
      const [link] = await db
        .insert(schema.externalLinkTable)
        .values({
          taskId: task!.id,
          integrationId: binding.id,
          resourceType: "issue",
          externalId: "1",
          url: `https://git.example/team/repo/issues/1`,
          metadata: JSON.stringify({ syncFilterPaused: true }),
        })
        .returning();
      return link!;
    };
    const firstLink = await pausedLink(first, 1);
    const secondLink = await pausedLink(second, 2);

    // Two bindings take their own scope locks concurrently: the lock derives
    // from the integration id, so sibling bindings never contend.
    await Promise.all([
      db.transaction((tx) =>
        lockResumeScopeById(first.id, firstLink.id, member.workspace.id, tx),
      ),
      db.transaction((tx) =>
        lockResumeScopeById(second.id, secondLink.id, member.workspace.id, tx),
      ),
    ]);

    // A link belongs to exactly one binding: the sibling's link is not found.
    await expect(
      db.transaction((tx) =>
        lockResumeScopeById(second.id, firstLink.id, member.workspace.id, tx),
      ),
    ).rejects.toMatchObject({ status: 404 });
  });
});
