import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import db, { schema } from "../../apps/api/src/database";
import * as events from "../../apps/api/src/events";
import { handleIssueOpened } from "../../apps/api/src/plugins/github/webhooks/issue-opened";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";

// RFC 0001 WP9 (matrix row D1.2): end-to-end webhook fan-out. One repository
// event must create a task in every project that bound the same repository,
// with the external link scoped per binding and task numbering per project.
// The provider client is mocked; the binding resolution, task creation and
// link writes run against the real database.
const provider = vi.hoisted(() => ({ labels: vi.fn(), comment: vi.fn() }));
vi.mock("../../apps/api/src/plugins/github/utils/github-app", () => ({
  getGithubApp: () => ({
    getInstallationOctokit: async () => ({
      rest: { issues: { createComment: provider.comment } },
    }),
  }),
}));
vi.mock("../../apps/api/src/plugins/github/utils/labels", () => ({
  addLabelsToIssue: async (...args: unknown[]) => {
    const write = args.at(-1);
    const send = () => provider.labels();
    return typeof write === "function" ? write(send) : send();
  },
}));

beforeEach(async () => {
  await resetTestDatabase();
  vi.clearAllMocks();
  provider.labels.mockReset().mockResolvedValue(undefined);
  provider.comment.mockReset().mockResolvedValue({ id: 123 });
});

describe("GitHub webhook fan-out across bound projects (RFC 0001 D1.2)", () => {
  it("creates one task per bound project from a single repository event", async () => {
    const { workspace } = await createWorkspaceMember();
    const { project: first } = await createProjectFixture({
      workspaceId: workspace.id,
      slug: "fanout-first",
    });
    const { project: second } = await createProjectFixture({
      workspaceId: workspace.id,
      slug: "fanout-second",
    });
    const [label] = await db
      .insert(schema.labelTable)
      .values({
        workspaceId: workspace.id,
        name: "export",
        color: "#123456",
      })
      .returning();
    const config = JSON.stringify({
      baseUrl: "https://github.com",
      repositoryOwner: "team",
      repositoryName: "repo",
      repositoryId: 707,
      installationId: 2,
      verifiedGithubAccountId: "3",
      verifiedByUserId: "test-user",
      accessToken: "test-only",
      syncRules: {
        outgoing: { mode: "labels", match: "any", labels: [label!.id] },
        incoming: { mode: "all" },
      },
    });
    const bindings = await db
      .insert(schema.integrationTable)
      .values([
        {
          projectId: first.id,
          type: "github",
          isActive: true,
          repositoryKey: "github:707",
          config,
        },
        {
          projectId: second.id,
          type: "github",
          isActive: true,
          repositoryKey: "github:707",
          config,
        },
      ])
      .returning();
    expect(bindings).toHaveLength(2);

    const publish = vi
      .spyOn(events, "publishEvent")
      .mockImplementation(async () => {});

    // No integrationId: the production dispatch path must resolve every
    // binding of the repository on its own.
    await handleIssueOpened({
      action: "opened",
      issue: {
        number: 5,
        title: "Shared repository issue",
        body: "Shared body",
        html_url: "https://github.com/team/repo/issues/5",
        labels: ["export"],
        user: { login: "author" },
      },
      installation: { id: 2 },
      repository: {
        id: 707,
        owner: { login: "team" },
        name: "repo",
        full_name: "team/repo",
      },
    });

    const firstTasks = await db.query.taskTable.findMany({
      where: eq(schema.taskTable.projectId, first.id),
    });
    const secondTasks = await db.query.taskTable.findMany({
      where: eq(schema.taskTable.projectId, second.id),
    });
    expect(firstTasks).toHaveLength(1);
    expect(secondTasks).toHaveLength(1);
    // Decision D1.2: both projects receive the event, and each project's
    // task numbering is its own sequence.
    expect(firstTasks[0]).toMatchObject({
      title: "Shared repository issue",
      number: 1,
    });
    expect(secondTasks[0]).toMatchObject({
      title: "Shared repository issue",
      number: 1,
    });
    expect(firstTasks[0]!.id).not.toBe(secondTasks[0]!.id);

    // External links are scoped per binding: each link ties its project's
    // task to that project's binding of the shared repository.
    const links = await db.query.externalLinkTable.findMany();
    expect(links).toHaveLength(2);
    for (const binding of bindings) {
      const link = links.find((row) => row.integrationId === binding.id);
      expect(link).toMatchObject({ externalId: "5", resourceType: "issue" });
      const owningTask =
        binding.projectId === first.id ? firstTasks[0] : secondTasks[0];
      expect(link!.taskId).toBe(owningTask!.id);
    }

    expect(
      publish.mock.calls.filter(([name]) => name === "task.created"),
    ).toHaveLength(2);
    // The linking comment is posted once per bound project.
    expect(provider.comment).toHaveBeenCalledTimes(2);
  });

  it("skips deactivated bindings while fanning out", async () => {
    const { workspace } = await createWorkspaceMember();
    const { project: active } = await createProjectFixture({
      workspaceId: workspace.id,
      slug: "fanout-active",
    });
    const { project: paused } = await createProjectFixture({
      workspaceId: workspace.id,
      slug: "fanout-paused",
    });
    const config = JSON.stringify({
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
    });
    await db.insert(schema.integrationTable).values([
      {
        projectId: active.id,
        type: "github",
        isActive: true,
        repositoryKey: "github:707",
        config,
      },
      {
        projectId: paused.id,
        type: "github",
        isActive: false,
        repositoryKey: "github:707",
        config,
      },
    ]);

    const publish = vi
      .spyOn(events, "publishEvent")
      .mockImplementation(async () => {});

    await handleIssueOpened({
      action: "opened",
      issue: {
        number: 6,
        title: "Only active bindings receive this",
        body: null,
        html_url: "https://github.com/team/repo/issues/6",
        labels: [],
        user: { login: "author" },
      },
      installation: { id: 2 },
      repository: {
        id: 707,
        owner: { login: "team" },
        name: "repo",
        full_name: "team/repo",
      },
    });

    expect(
      await db.query.taskTable.findMany({
        where: eq(schema.taskTable.projectId, active.id),
      }),
    ).toHaveLength(1);
    expect(
      await db.query.taskTable.findMany({
        where: eq(schema.taskTable.projectId, paused.id),
      }),
    ).toHaveLength(0);
    expect(await db.query.externalLinkTable.findMany()).toHaveLength(1);
    expect(
      publish.mock.calls.filter(([name]) => name === "task.created"),
    ).toHaveLength(1);
    expect(provider.comment).toHaveBeenCalledTimes(1);
  });
});
