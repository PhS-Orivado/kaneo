import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import db from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";

// RFC 0001 WP9 (ledger item 6.4): the cross-project variant of the
// concurrent-create race. Decision D1 allows the same repository in several
// projects, so two projects binding the same repository at the same time must
// both succeed and keep their own binding rows with distinct secrets. The
// provider client is mocked; the race runs against the real routes and
// database.
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

function link(repositoryName: string) {
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

describe("Cross-project concurrent binding creates (RFC 0001 D1)", () => {
  it("keeps both rows when two projects bind the same repository concurrently", async () => {
    const member = await createWorkspaceMember({ role: "admin" });
    const { project } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    const { project: otherProject } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const results = await Promise.allSettled([
      app.request(`/api/gitea-integration/project/${project.id}`, link("repo")),
      app.request(
        `/api/gitea-integration/project/${otherProject.id}`,
        link("repo"),
      ),
    ]);
    const fulfilled = results.filter(
      (result) => result.status === "fulfilled",
    ) as PromiseFulfilledResult<Response>[];
    expect(fulfilled).toHaveLength(2);
    expect(fulfilled.map((result) => result.value.status)).toEqual([200, 200]);

    const rows = await db.query.integrationTable.findMany();
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((row) => row.projectId))).toEqual(
      new Set([project.id, otherProject.id]),
    );
    expect(new Set(rows.map((row) => row.repositoryKey)).size).toBe(1);
    // Each binding keeps its own webhook secret (D1, WP3).
    const secrets = rows.map(
      (row) => JSON.parse(row.config).webhookSecret as string,
    );
    expect(new Set(secrets).size).toBe(2);
  });
});
