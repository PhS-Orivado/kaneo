import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import db, { schema } from "../../apps/api/src/database";
import * as events from "../../apps/api/src/events";
import { createApp } from "../../apps/api/src/index";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";

// RFC 0001 WP10: the repository binding quota counts active github, gitea and
// gitlab bindings per project against a per-workspace limit
// (workspace_limit.max_repositories_per_project, falling back to
// KANEO_MAX_REPOSITORIES_PER_PROJECT, null meaning unlimited). Enforced at
// create, and at update when reactivating a deactivated binding.

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
  vi.spyOn(events, "publishEvent").mockResolvedValue(undefined);
  vi.clearAllMocks();
});

type Provider = "github" | "gitea" | "gitlab";

async function ownerWithProject(limit: number | null) {
  const member = await createWorkspaceMember({ role: "owner" });
  const { project } = await createProjectFixture({
    workspaceId: member.workspace.id,
  });
  if (limit !== null) {
    await db.insert(schema.workspaceLimitTable).values({
      workspaceId: member.workspace.id,
      maxRepositoriesPerProject: limit,
    });
  }
  return { owner: member, project };
}

async function insertActiveBinding(
  projectId: string,
  type: Provider,
  name: string,
) {
  const [binding] = await db
    .insert(schema.integrationTable)
    .values({
      projectId,
      type,
      isActive: true,
      repositoryKey: `${type}:example/${name}`,
      config: JSON.stringify({ baseUrl: "https://git.example" }),
    })
    .returning();
  return binding!;
}

function createGiteaBinding(
  app: ReturnType<typeof createApp>["app"],
  projectId: string,
  repositoryName: string,
) {
  return app.request(`/api/gitea-integration/project/${projectId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      baseUrl: "https://git.example",
      accessToken: "token",
      repositoryOwner: "acme",
      repositoryName,
    }),
  });
}

async function giteaUsage(
  app: ReturnType<typeof createApp>["app"],
  projectId: string,
) {
  const response = await app.request(
    `/api/gitea-integration/project/${projectId}/integrations`,
  );
  expect(response.status).toBe(200);
  return (await response.json()) as {
    integrations: unknown[];
    usage: { used: number; limit: number | null };
  };
}

describe("Repository binding quota lifecycle (RFC 0001 WP10)", () => {
  it("refuses a create at the limit with a 402 and the documented body", async () => {
    const { owner, project } = await ownerWithProject(2);
    await insertActiveBinding(project.id, "gitea", "alpha");
    await insertActiveBinding(project.id, "gitea", "beta");
    mockAuthenticatedSession(owner.user);
    const { app } = createApp();

    const refused = await createGiteaBinding(app, project.id, "gamma");
    // The quota guard runs after verification, so the credentials were
    // validated but nothing was persisted.
    expect(m.verify).toHaveBeenCalled();
    expect(refused.status).toBe(402);
    expect(await refused.json()).toMatchObject({
      code: "binding_limit_exceeded",
      used: 2,
      limit: 2,
    });
    const rows = await db.query.integrationTable.findMany();
    expect(rows).toHaveLength(2);
    expect(events.publishEvent).toHaveBeenCalledWith(
      "integration.binding_quota_exceeded",
      expect.objectContaining({ used: 2, limit: 2 }),
    );

    const { usage } = await giteaUsage(app, project.id);
    expect(usage).toEqual({ used: 2, limit: 2 });
  });

  it("frees quota on deactivation and re-checks reactivation", async () => {
    const { owner, project } = await ownerWithProject(2);
    const alpha = await insertActiveBinding(project.id, "gitea", "alpha");
    await insertActiveBinding(project.id, "gitea", "beta");
    mockAuthenticatedSession(owner.user);
    const { app } = createApp();

    // Deactivating a binding frees its slot...
    const deactivated = await app.request(
      `/api/gitea-integration/integration/${alpha.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: false }),
      },
    );
    expect(deactivated.status).toBe(200);
    let { usage } = await giteaUsage(app, project.id);
    expect(usage).toEqual({ used: 1, limit: 2 });

    // ...so a new repository fits again.
    const created = await createGiteaBinding(app, project.id, "gamma");
    expect(created.status).toBe(200);

    // Reactivating the deactivated binding is re-checked and refused at the
    // refilled limit.
    const reactivated = await app.request(
      `/api/gitea-integration/integration/${alpha.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: true }),
      },
    );
    expect(reactivated.status).toBe(402);
    expect(await reactivated.json()).toMatchObject({
      code: "binding_limit_exceeded",
      used: 2,
      limit: 2,
    });
    const active = await db.query.integrationTable.findMany();
    expect(
      active.filter((row) => row.type === "gitea" && row.isActive),
    ).toHaveLength(2);
    usage = (await giteaUsage(app, project.id)).usage;
    expect(usage.used).toBe(2);
  });

  it("counts active bindings across providers, and inactive ones not at all", async () => {
    const { owner, project } = await ownerWithProject(3);
    await insertActiveBinding(project.id, "github", "gh-1");
    await insertActiveBinding(project.id, "gitlab", "gl-1");
    await insertActiveBinding(project.id, "gitea", "alpha");
    const [inactive] = await db
      .insert(schema.integrationTable)
      .values({
        projectId: project.id,
        type: "gitlab",
        isActive: false,
        repositoryKey: "gitlab:example/gl-2",
        config: JSON.stringify({ baseUrl: "https://git.example" }),
      })
      .returning();
    expect(inactive).toBeDefined();
    mockAuthenticatedSession(owner.user);
    const { app } = createApp();

    // Three ACTIVE bindings across github, gitlab and gitea fill the limit;
    // the inactive row does not count.
    const refused = await createGiteaBinding(app, project.id, "beta");
    expect(refused.status).toBe(402);
    expect(await refused.json()).toMatchObject({ used: 3, limit: 3 });
  });

  it("stays unlimited without a workspace limit row or instance default", async () => {
    const { owner, project } = await ownerWithProject(null);
    mockAuthenticatedSession(owner.user);
    const { app } = createApp();
    for (const name of ["alpha", "beta", "gamma"]) {
      const created = await createGiteaBinding(app, project.id, name);
      expect(created.status).toBe(200);
    }
    const { usage } = await giteaUsage(app, project.id);
    expect(usage).toEqual({ used: 3, limit: null });
  });
});
