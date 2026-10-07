import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";

const provider = vi.hoisted(() => ({
  listIssues: vi.fn(async () => []),
  listPulls: vi.fn(async () => []),
  listMergeRequests: vi.fn(async () => []),
  listIssueNotes: vi.fn(async () => []),
}));
vi.mock(
  "../../apps/api/src/plugins/gitea/utils/gitea-api",
  async (original) => ({
    ...(await original<
      typeof import("../../apps/api/src/plugins/gitea/utils/gitea-api")
    >()),
    createGiteaClient: () => provider,
  }),
);
vi.mock(
  "../../apps/api/src/plugins/gitlab/utils/gitlab-api",
  async (original) => ({
    ...(await original<
      typeof import("../../apps/api/src/plugins/gitlab/utils/gitlab-api")
    >()),
    createGitlabClient: () => provider,
  }),
);
beforeEach(async () => {
  await resetTestDatabase();
  vi.clearAllMocks();
});
describe("github, gitea and gitlab import permissions", () => {
  it.each(["github", "gitea", "gitlab"])(
    "%s denies a create-only custom role",
    async (type) => {
      const member = await createWorkspaceMember({ role: "importer" });
      await db.insert(schema.workspaceRoleTable).values({
        workspaceId: member.workspace.id,
        role: "importer",
        permission: JSON.stringify({ task: ["create"] }),
      });
      const { project } = await createProjectFixture({
        workspaceId: member.workspace.id,
      });
      // The github, gitea and gitlab import routes are keyed by integration
      // id (RFC 0001 WP2/WP3/WP4).
      const [integration] = await db
        .insert(schema.integrationTable)
        .values({
          projectId: project.id,
          type,
          isActive: true,
          config: JSON.stringify(
            type === "github"
              ? {
                  repositoryOwner: "example",
                  repositoryName: "repo",
                  installationId: 1,
                  repositoryId: 2,
                  verifiedGithubAccountId: "3",
                  verifiedByUserId: member.user.id,
                }
              : type === "gitlab"
                ? {
                    baseUrl: "https://gitlab.example",
                    accessToken: "fake-test-token",
                    projectPath: "owner/repo",
                  }
                : {
                    baseUrl: "https://gitea.example",
                    accessToken: "fake-test-token",
                    repositoryOwner: "owner",
                    repositoryName: "repo",
                  },
          ),
        })
        .returning();
      mockAuthenticatedSession(member.user);
      const { app } = createApp();
      const response = await app.request(
        `/api/${type}-integration/import-issues`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ integrationId: integration!.id }),
        },
      );
      expect(response.status).toBe(403);
      expect(provider.listIssues).not.toHaveBeenCalled();
    },
  );
  it.each(["gitea", "gitlab"])(
    "%s accepts a custom role with both create and update",
    async (type) => {
      const member = await createWorkspaceMember({ role: "importer" });
      await db.insert(schema.workspaceRoleTable).values({
        workspaceId: member.workspace.id,
        role: "importer",
        permission: JSON.stringify({ task: ["create", "update"] }),
      });
      const { project } = await createProjectFixture({
        workspaceId: member.workspace.id,
      });
      const [integration] = await db
        .insert(schema.integrationTable)
        .values({
          projectId: project.id,
          type,
          isActive: true,
          config: JSON.stringify(
            type === "gitlab"
              ? {
                  baseUrl: "https://gitlab.example",
                  accessToken: "fake-test-token",
                  projectPath: "owner/repo",
                }
              : {
                  baseUrl: "https://gitea.example",
                  accessToken: "fake-test-token",
                  repositoryOwner: "owner",
                  repositoryName: "repo",
                },
          ),
        })
        .returning();
      mockAuthenticatedSession(member.user);
      const { app } = createApp();
      const response = await app.request(
        `/api/${type}-integration/import-issues`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ integrationId: integration!.id }),
        },
      );
      expect(response.status).toBe(200);
      expect(provider.listIssues).toHaveBeenCalled();
    },
  );
});
