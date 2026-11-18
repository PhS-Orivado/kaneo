import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import db, { schema } from "../../apps/api/src/database";
import * as events from "../../apps/api/src/events";
import { createApp } from "../../apps/api/src/index";
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

// RFC 0001 WP5: the sync routes are keyed by integration id so every
// repository binding carries its own rules, preview token, and authorization.
// These suites cover the isolation between sibling bindings, the token
// binding, and the access matrix around preview and save.

type SyncBinding = typeof schema.integrationTable.$inferSelect;

async function ownerWithProject() {
  const member = await createWorkspaceMember({ role: "owner" });
  const { project, columns } = await createProjectFixture({
    workspaceId: member.workspace.id,
  });
  return { owner: member, project, columns };
}

async function addWorkspaceMember(workspaceId: string) {
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
    role: "member",
    joinedAt: new Date(),
  });
  return user!;
}

async function insertGiteaBinding(
  projectId: string,
  repositoryName: string,
): Promise<SyncBinding> {
  const [binding] = await db
    .insert(schema.integrationTable)
    .values({
      projectId,
      type: "gitea",
      isActive: true,
      repositoryKey: `gitea:https://git.example/team/${repositoryName}`,
      baseUrl: "https://git.example",
      repositoryOwner: "team",
      repositoryName,
      config: JSON.stringify({
        baseUrl: "https://git.example",
        accessToken: "test-only",
        repositoryOwner: "team",
        repositoryName,
        webhookSecret: "test-only-secret",
        syncRules: defaultSyncRules,
      }),
    })
    .returning();
  return binding!;
}

async function readSyncRules(id: string): Promise<SyncRules> {
  const row = await db.query.integrationTable.findFirst({
    where: eq(schema.integrationTable.id, id),
  });
  if (!row) throw new Error(`integration ${id} not found`);
  return JSON.parse(row.config).syncRules;
}

const labelRules: SyncRules = {
  ...defaultSyncRules,
  incoming: { mode: "labels", match: "all", labels: ["ready"] },
};

const preview = (
  app: ReturnType<typeof createApp>["app"],
  integrationId: string,
  rules: SyncRules,
) =>
  app.request(`/api/integration-sync/integration/${integrationId}/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rules }),
  });

const save = (
  app: ReturnType<typeof createApp>["app"],
  integrationId: string,
  rules: SyncRules,
  previewToken: string,
) =>
  app.request(`/api/integration-sync/integration/${integrationId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rules, previewToken }),
  });

beforeEach(async () => {
  await resetTestDatabase();
  vi.spyOn(events, "publishEvent").mockResolvedValue(undefined);
});

describe("Integration sync routes keyed by binding (RFC 0001 WP5)", () => {
  it("saves rules on one binding and leaves sibling bindings untouched", async () => {
    const { owner, project } = await ownerWithProject();
    const webBinding = await insertGiteaBinding(project.id, "web");
    const apiBinding = await insertGiteaBinding(project.id, "api");
    mockAuthenticatedSession(owner.user);
    const { app } = createApp();

    const previewResponse = await preview(app, webBinding.id, labelRules);
    expect(previewResponse.status).toBe(200);
    const previewBody = (await previewResponse.json()) as {
      previewToken: string;
      rules: SyncRules;
      willPause: number;
      willCreate: number;
    };
    expect(previewBody.rules.incoming).toEqual(labelRules.incoming);
    expect(previewBody.previewToken).toHaveLength(64);

    const saved = await save(
      app,
      webBinding.id,
      labelRules,
      previewBody.previewToken,
    );
    expect(saved.status).toBe(200);
    expect((await saved.json()).rules.incoming).toEqual(labelRules.incoming);

    expect(await readSyncRules(webBinding.id)).toEqual(labelRules);
    // The sibling binding keeps the untouched default rules.
    expect(await readSyncRules(apiBinding.id)).toEqual(defaultSyncRules);
  });

  it("binds the preview token to the addressed row, not the rules alone", async () => {
    const { owner, project } = await ownerWithProject();
    const webBinding = await insertGiteaBinding(project.id, "web");
    const apiBinding = await insertGiteaBinding(project.id, "api");
    mockAuthenticatedSession(owner.user);
    const { app } = createApp();

    const tokenFor = async (integrationId: string) => {
      const response = await preview(app, integrationId, labelRules);
      expect(response.status).toBe(200);
      return ((await response.json()) as { previewToken: string })
        .previewToken;
    };
    const webToken = await tokenFor(webBinding.id);
    const apiToken = await tokenFor(apiBinding.id);
    expect(webToken).not.toBe(apiToken);

    // A token minted for the sibling binding must not authorize saving on
    // this binding, even though both rows share rules and config shape.
    const replay = await save(app, webBinding.id, labelRules, apiToken);
    expect(replay.status).toBe(409);
    expect(await readSyncRules(webBinding.id)).toEqual(defaultSyncRules);

    const saved = await save(app, webBinding.id, labelRules, webToken);
    expect(saved.status).toBe(200);
    expect(await readSyncRules(webBinding.id)).toEqual(labelRules);
  });

  it("enforces the read and manage matrices on the id-keyed routes", async () => {
    const { owner, project } = await ownerWithProject();
    const binding = await insertGiteaBinding(project.id, "web");
    const member = await addWorkspaceMember(owner.workspace.id);
    const outsider = await createWorkspaceMember({ role: "owner" });
    const { app } = createApp();

    // Workspace members read one binding's saved rules but cannot preview or
    // save changes.
    mockAuthenticatedSession(member);
    const getResponse = await app.request(
      `/api/integration-sync/integration/${binding.id}`,
    );
    expect(getResponse.status).toBe(200);
    const getBody = (await getResponse.json()) as { rules: SyncRules };
    expect(getBody.rules).toEqual(defaultSyncRules);
    expect((await preview(app, binding.id, labelRules)).status).toBe(403);
    expect(
      (await save(app, binding.id, labelRules, "a".repeat(64))).status,
    ).toBe(403);

    // Foreign-workspace callers learn nothing: same 404 as an unknown id.
    mockAuthenticatedSession(outsider.user);
    expect(
      (
        await app.request(`/api/integration-sync/integration/${binding.id}`)
      ).status,
    ).toBe(404);
    expect(
      (
        await app.request("/api/integration-sync/integration/unknown")
      ).status,
    ).toBe(404);

    // Owners keep full access through the binding-keyed path.
    mockAuthenticatedSession(owner.user);
    const previewResponse = await preview(app, binding.id, labelRules);
    expect(previewResponse.status).toBe(200);
    const saved = await save(
      app,
      binding.id,
      labelRules,
      ((await previewResponse.json()) as { previewToken: string }).previewToken,
    );
    expect(saved.status).toBe(200);
    expect(await readSyncRules(binding.id)).toEqual(labelRules);
  });
});
