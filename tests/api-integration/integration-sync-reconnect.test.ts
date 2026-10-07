import { eq } from "drizzle-orm";
import { beforeEach, expect, it, vi } from "vite-plus/test";
import db, { schema } from "../../apps/api/src/database";
import * as events from "../../apps/api/src/events";
import createGiteaIntegration from "../../apps/api/src/gitea-integration/controllers/create-gitea-integration";
import createGitlabIntegration from "../../apps/api/src/gitlab-integration/controllers/create-gitlab-integration";
import { getSyncIntegration } from "../../apps/api/src/integration-sync/controllers/get-integration";
import { previewSyncRules } from "../../apps/api/src/integration-sync/controllers/preview-rules";
import { saveSyncRules } from "../../apps/api/src/integration-sync/controllers/save-rules";
import {
  defaultSyncRules,
  type SyncRules,
} from "../../apps/api/src/plugins/sync/rules";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";

const verify = vi.hoisted(() => vi.fn());
vi.mock("../../apps/api/src/plugins/gitea/utils/gitea-api", () => ({
  GiteaApiError: class extends Error {},
  verifyGiteaToken: verify,
  createGiteaClient: () => ({ getRepo: async () => ({}) }),
}));
vi.mock("../../apps/api/src/plugins/gitlab/utils/gitlab-api", () => ({
  GitlabApiError: class extends Error {},
  verifyGitlabToken: verify,
  createGitlabClient: () => ({ getProject: async () => ({}) }),
}));
beforeEach(async () => {
  await resetTestDatabase();
  verify.mockReset().mockResolvedValue({ id: 1 });
  vi.spyOn(events, "publishEvent").mockResolvedValue(undefined);
});

// RFC 0001 WP4: the gitlab create controller inserts a fresh binding row
// instead of updating the single existing row in place, so a reconnect can
// no longer overwrite rules saved during verification: the legacy row keeps
// its rules untouched and the new binding carries its own fresh webhook
// secret. A legacy NULL repository_key row does not collide with the new
// keyed row (the partial unique constraint only applies to NULL keys).
it("gitlab reconnect adds a fresh binding instead of overwriting saved rules", async () => {
  const { workspace } = await createWorkspaceMember();
  const { project } = await createProjectFixture({
    workspaceId: workspace.id,
  });
  const base = {
    baseUrl: "https://git.example",
    accessToken: "test-only",
    webhookSecret: "test-hook",
  };
  const [legacy] = await db
    .insert(schema.integrationTable)
    .values({
      projectId: project.id,
      type: "gitlab",
      isActive: true,
      config: JSON.stringify({
        ...base,
        projectPath: "team/repo",
        syncRules: defaultSyncRules,
      }),
    })
    .returning();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  verify.mockImplementationOnce(async () => {
    await gate;
    return { id: 1 };
  });
  const pending = createGitlabIntegration({
    ...base,
    projectId: project.id,
    tokenType: "private",
    projectPath: "team/repo",
  });
  const rules: SyncRules = {
    ...defaultSyncRules,
    incoming: { mode: "labels", match: "all", labels: ["ready"] },
  };
  try {
    await vi.waitFor(() => expect(verify).toHaveBeenCalledOnce());
    const preview = await previewSyncRules(
      await getSyncIntegration(project.id, "gitlab"),
      rules,
    );
    await saveSyncRules(
      project.id,
      "gitlab",
      rules,
      preview.previewToken,
      workspace.id,
    );
  } finally {
    release();
  }
  const created = await pending;
  // The legacy row keeps the rules saved during verification.
  expect(
    JSON.parse(
      (
        await db.query.integrationTable.findFirst({
          where: eq(schema.integrationTable.id, legacy!.id),
        })
      )!.config,
    ).syncRules,
  ).toEqual(rules);
  // A new keyed binding row exists with a fresh webhook secret.
  const rows = await db.query.integrationTable.findMany({
    where: eq(schema.integrationTable.projectId, project.id),
  });
  expect(rows).toHaveLength(2);
  const fresh = rows.find((row) => row.id !== legacy!.id)!;
  expect(fresh.repositoryKey).toBe("gitlab:https://git.example/team/repo");
  expect(JSON.parse(fresh.config).webhookSecret).not.toBe("test-hook");
  expect(created.webhookSecret).not.toBe("test-hook");
  expect(created.id).not.toBe(legacy!.id);
});

// RFC 0001 WP3: the gitea create controller inserts a fresh binding row
// instead of updating the single existing row in place, so a reconnect can
// no longer overwrite rules saved during verification: the legacy row keeps
// its rules untouched and the new binding carries its own fresh webhook
// secret. A legacy NULL repository_key row does not collide with the new
// keyed row (the partial unique constraint only applies to NULL keys).
it("gitea reconnect adds a fresh binding instead of overwriting saved rules", async () => {
  const { workspace } = await createWorkspaceMember();
  const { project } = await createProjectFixture({
    workspaceId: workspace.id,
  });
  const base = {
    baseUrl: "https://git.example",
    accessToken: "test-only",
    webhookSecret: "test-hook",
  };
  const [legacy] = await db
    .insert(schema.integrationTable)
    .values({
      projectId: project.id,
      type: "gitea",
      isActive: true,
      config: JSON.stringify({
        ...base,
        repositoryOwner: "team",
        repositoryName: "repo",
        syncRules: defaultSyncRules,
      }),
    })
    .returning();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  verify.mockImplementationOnce(async () => {
    await gate;
    return { id: 1 };
  });
  const pending = createGiteaIntegration({
    ...base,
    projectId: project.id,
    repositoryOwner: "team",
    repositoryName: "repo",
  });
  const rules: SyncRules = {
    ...defaultSyncRules,
    incoming: { mode: "labels", match: "all", labels: ["ready"] },
  };
  try {
    await vi.waitFor(() => expect(verify).toHaveBeenCalledOnce());
    const preview = await previewSyncRules(
      await getSyncIntegration(project.id, "gitea"),
      rules,
    );
    await saveSyncRules(
      project.id,
      "gitea",
      rules,
      preview.previewToken,
     workspace.id,
    );
  } finally {
    release();
  }
  const created = await pending;
  // The legacy row keeps the rules saved during verification.
  expect(
    JSON.parse(
      (
        await db.query.integrationTable.findFirst({
          where: eq(schema.integrationTable.id, legacy!.id),
        })
      )!.config,
    ).syncRules,
  ).toEqual(rules);
  // A new keyed binding row exists with a fresh webhook secret.
  const rows = await db.query.integrationTable.findMany({
    where: eq(schema.integrationTable.projectId, project.id),
  });
  expect(rows).toHaveLength(2);
  const fresh = rows.find((row) => row.id !== legacy!.id)!;
  expect(fresh.repositoryKey).toBe("gitea:https://git.example/team/repo");
  expect(JSON.parse(fresh.config).webhookSecret).not.toBe("test-hook");
  expect(created.webhookSecret).not.toBe("test-hook");
  expect(created.id).not.toBe(legacy!.id);
});