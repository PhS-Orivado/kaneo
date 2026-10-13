import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";

// RFC 0001 WP9/WP10: repository binding quota lifecycle acceptance. A
// deactivated binding frees quota without deleting the row, reactivation is
// re-checked against the plan limit, and the count mixes the three git
// providers. The provider client is mocked; every quota decision runs
// through the real routes, guards and database.
const provider = vi.hoisted(() => ({
  verifyGiteaToken: vi.fn(),
  getRepo: vi.fn(),
  listIssues: vi.fn(),
  listPulls: vi.fn(),
  listIssueComments: vi.fn(),
}));
vi.mock(
  "../../apps/api/src/plugins/gitea/utils/gitea-api",
  async (original) => ({
    ...(await original<
      typeof import("../../apps/api/src/plugins/gitea/utils/gitea-api")
    >()),
    verifyGiteaToken: provider.verifyGiteaToken,
    createGiteaClient: () => ({
      getRepo: provider.getRepo,
      listIssues: provider.listIssues,
      listPulls: provider.listPulls,
      listIssueComments: provider.listIssueComments,
    }),
  }),
);

beforeEach(async () => {
  await resetTestDatabase();
  vi.clearAllMocks();
  provider.verifyGiteaToken.mockResolvedValue(undefined);
  provider.getRepo.mockResolvedValue(undefined);
  provider.listIssues.mockResolvedValue([]);
  provider.listPulls.mockResolvedValue([]);
  provider.listIssueComments.mockResolvedValue([]);
});

async function adminWithProject() {
  const member = await createWorkspaceMember({ role: "admin" });
  const { project } = await createProjectFixture({
    workspaceId: member.workspace.id,
  });
  mockAuthenticatedSession(member.user);
  return { member, project };
}

function linkBody(repositoryName: string) {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      baseUrl: "https://gitea.example",
      accessToken: "token",
      repositoryOwner: "owner",
      repositoryName,
    }),
  };
}

function setActive(isActive: boolean) {
  return {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ isActive }),
  };
}

async function bindingId(projectId: string, repositoryName: string) {
  const [row] = await db
    .select()
    .from(schema.integrationTable)
    .where(
      and(
        eq(schema.integrationTable.projectId, projectId),
        eq(
          schema.integrationTable.repositoryKey,
          `gitea:https://gitea.example/owner/${repositoryName}`,
        ),
      ),
    );
  if (!row) throw new Error(`binding ${repositoryName} not found`);
  return row.id;
}

async function usage(
  app: ReturnType<typeof createApp>["app"],
  projectId: string,
) {
  const response = await app.request(
    `/api/gitea-integration/project/${projectId}/integrations`,
  );
  expect(response.status).toBe(200);
  return (await response.json()).usage as {
    used: number;
    limit: number | null;
  };
}

describe("Repository binding quota lifecycle (RFC 0001 WP10)", () => {
  it("frees quota on deactivation and re-checks reactivation", async () => {
    const { member, project } = await adminWithProject();
    await db.insert(schema.workspaceLimitTable).values({
      workspaceId: member.workspace.id,
      maxRepositoriesPerProject: 2,
    });
    const { app } = createApp();

    // Two bindings fill the quota.
    expect(
      (
        await app.request(
          `/api/gitea-integration/project/${project.id}`,
          linkBody("alpha"),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await app.request(
          `/api/gitea-integration/project/${project.id}`,
          linkBody("beta"),
        )
      ).status,
    ).toBe(200);
    const third = await app.request(
      `/api/gitea-integration/project/${project.id}`,
      linkBody("gamma"),
    );
    expect(third.status).toBe(402);
    expect(await third.json()).toMatchObject({
      code: "binding_limit_exceeded",
      used: 2,
      limit: 2,
    });

    // Deactivating one binding frees quota without deleting the row.
    const betaId = await bindingId(project.id, "beta");
    const deactivate = await app.request(
      `/api/gitea-integration/integration/${betaId}`,
      setActive(false),
    );
    expect(deactivate.status).toBe(200);
    const deactivated = await db.query.integrationTable.findFirst({
      where: eq(schema.integrationTable.id, betaId),
    });
    expect(deactivated?.isActive).toBe(false);
    expect(await usage(app, project.id)).toMatchObject({ used: 1, limit: 2 });

    // The refused binding now fits in the freed slot.
    expect(
      (
        await app.request(
          `/api/gitea-integration/project/${project.id}`,
          linkBody("gamma"),
        )
      ).status,
    ).toBe(200);

    // Reactivation is re-checked: the quota is full again.
    const reactivate = await app.request(
      `/api/gitea-integration/integration/${betaId}`,
      setActive(true),
    );
    expect(reactivate.status).toBe(402);
    expect(await reactivate.json()).toMatchObject({
      code: "binding_limit_exceeded",
      used: 2,
      limit: 2,
    });

    // Freeing another slot lets the reactivation through.
    const alphaId = await bindingId(project.id, "alpha");
    expect(
      (
        await app.request(
          `/api/gitea-integration/integration/${alphaId}`,
          setActive(false),
        )
      ).status,
    ).toBe(200);
    const reactivateRetry = await app.request(
      `/api/gitea-integration/integration/${betaId}`,
      setActive(true),
    );
    expect(reactivateRetry.status).toBe(200);

    const rows = await db.query.integrationTable.findMany({
      where: eq(schema.integrationTable.projectId, project.id),
    });
    expect(rows).toHaveLength(3);
    expect(await usage(app, project.id)).toMatchObject({ used: 2, limit: 2 });
  });

  it("counts active bindings across providers", async () => {
    const { member, project } = await adminWithProject();
    await db.insert(schema.workspaceLimitTable).values({
      workspaceId: member.workspace.id,
      maxRepositoriesPerProject: 3,
    });
    const { app } = createApp();

    expect(
      (
        await app.request(
          `/api/gitea-integration/project/${project.id}`,
          linkBody("alpha"),
        )
      ).status,
    ).toBe(200);

    // GitHub and GitLab bindings of the same project count toward the same
    // quota, even though they were not created through the Gitea routes.
    await db.insert(schema.integrationTable).values([
      {
        projectId: project.id,
        type: "github",
        isActive: true,
        repositoryKey: "github:707",
        config: JSON.stringify({
          baseUrl: "https://github.com",
          repositoryOwner: "team",
          repositoryName: "repo",
          repositoryId: 707,
          installationId: 2,
          verifiedGithubAccountId: "3",
          verifiedByUserId: "test-user",
          accessToken: "test-only",
          syncRules: {
            outgoing: { mode: "all" },
            incoming: { mode: "all" },
          },
        }),
      },
      {
        projectId: project.id,
        type: "gitlab",
        isActive: true,
        repositoryKey: "gitlab:https://gitlab.example/team/repo",
        config: JSON.stringify({
          baseUrl: "https://gitlab.example",
          accessToken: "token",
          projectPath: "team/repo",
          syncRules: {
            outgoing: { mode: "all" },
            incoming: { mode: "all" },
          },
        }),
      },
    ]);
    expect(await usage(app, project.id)).toMatchObject({ used: 3, limit: 3 });

    const refused = await app.request(
      `/api/gitea-integration/project/${project.id}`,
      linkBody("beta"),
    );
    expect(refused.status).toBe(402);
    expect(await refused.json()).toMatchObject({
      code: "binding_limit_exceeded",
      used: 3,
      limit: 3,
    });

    // Deactivating the Gitea binding frees a slot while the GitHub and
    // GitLab bindings keep counting, so a second Gitea repository fits.
    const alphaId = await bindingId(project.id, "alpha");
    expect(
      (
        await app.request(
          `/api/gitea-integration/integration/${alphaId}`,
          setActive(false),
        )
      ).status,
    ).toBe(200);
    expect(await usage(app, project.id)).toMatchObject({ used: 2, limit: 3 });
    expect(
      (
        await app.request(
          `/api/gitea-integration/project/${project.id}`,
          linkBody("beta"),
        )
      ).status,
    ).toBe(200);
    expect(await usage(app, project.id)).toMatchObject({ used: 3, limit: 3 });
  });
});
