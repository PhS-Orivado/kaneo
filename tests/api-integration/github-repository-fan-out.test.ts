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

// RFC 0001 WP2 / decision D1.2: one repository event fans out to every
// project that bound the repository. The routing goes through the
// repository_key index (github:<repositoryId>, with a legacy owner/name
// fallback), respects the delivering installation, and writes one task per
// project with that project's own task numbering.

const m = vi.hoisted(() => ({
  getRepoInstallation: vi.fn(),
  createComment: vi.fn(),
}));
vi.mock("../../apps/api/src/plugins/github/utils/github-app", () => ({
  getGithubApp: () => ({
    octokit: { rest: { apps: { getRepoInstallation: m.getRepoInstallation } } },
    getInstallationOctokit: async () => ({
      rest: { issues: { createComment: m.createComment } },
    }),
  }),
}));

beforeEach(async () => {
  await resetTestDatabase();
  vi.spyOn(events, "publishEvent").mockResolvedValue(undefined);
  vi.clearAllMocks();
  m.createComment.mockResolvedValue({});
});

async function ownerWithProject() {
  const member = await createWorkspaceMember({ role: "owner" });
  const { project, columns } = await createProjectFixture({
    workspaceId: member.workspace.id,
  });
  return { owner: member, project, columns };
}

async function insertGithubBinding(
  projectId: string,
  verifiedByUserId: string,
  overrides?: { installationId?: number; isActive?: boolean },
) {
  const [binding] = await db
    .insert(schema.integrationTable)
    .values({
      projectId,
      type: "github",
      isActive: overrides?.isActive ?? true,
      repositoryKey: "github:402",
      repositoryOwner: "acme",
      repositoryName: "repo",
      config: JSON.stringify({
        repositoryOwner: "acme",
        repositoryName: "repo",
        repositoryId: 402,
        installationId: overrides?.installationId ?? 10,
        verifiedGithubAccountId: "30",
        verifiedByUserId,
        accessToken: "test-only",
        webhookSecret: "test-only-secret",
        commentTaskLinkOnGitHubIssue: true,
      }),
    })
    .returning();
  return binding!;
}

function issueOpenedPayload(issueNumber: number) {
  return {
    action: "opened",
    issue: {
      number: issueNumber,
      title: `Issue ${issueNumber}`,
      body: "",
      html_url: "https://github.com/acme/repo/issues/" + String(issueNumber),
      labels: [],
      user: { login: "octocat" },
      state: "open",
    },
    installation: { id: 10 },
    repository: {
      id: 402,
      owner: { login: "acme" },
      name: "repo",
      full_name: "acme/repo",
    },
  };
}

async function tasksOf(projectId: string) {
  return db.query.taskTable.findMany({
    where: eq(schema.taskTable.projectId, projectId),
  });
}

describe("GitHub repository event fan-out (RFC 0001 WP2, D1.2)", () => {
  it("creates one task per bound project with per-project numbering", async () => {
    const first = await ownerWithProject();
    const second = await ownerWithProject();
    const third = await ownerWithProject();
    const firstBinding = await insertGithubBinding(
      first.project.id,
      first.owner.user.id,
    );
    const secondBinding = await insertGithubBinding(
      second.project.id,
      second.owner.user.id,
    );
    // An inactive binding must not receive tasks even though its repository
    // key matches, and neither may a binding created through another
    // installation (third) or an unverified row.
    await insertGithubBinding(third.project.id, third.owner.user.id, {
      isActive: false,
    });
    const fourth = await ownerWithProject();
    await insertGithubBinding(fourth.project.id, fourth.owner.user.id, {
      installationId: 11,
    });

    await handleIssueOpened(issueOpenedPayload(7));

    for (const context of [first, second] as const) {
      const tasks = await tasksOf(context.project.id);
      expect(tasks).toHaveLength(1);
      expect(tasks[0]).toMatchObject({
        title: "Issue 7",
        number: 1,
        columnId: context.columns.todo.id,
      });
    }
    for (const context of [third, fourth] as const) {
      expect(await tasksOf(context.project.id)).toHaveLength(0);
    }

    // Each binding gets its own external link, keyed by the issue number.
    const links = await db.query.externalLinkTable.findMany();
    expect(links).toHaveLength(2);
    expect(
      new Set(links.map((link) => link.integrationId)),
    ).toEqual(new Set([firstBinding.id, secondBinding.id]));
    for (const link of links) {
      expect(link).toMatchObject({
        resourceType: "issue",
        externalId: "7",
        url: "https://github.com/acme/repo/issues/7",
      });
    }

    // Both projects got a task-link comment, each with its own project
    // identifier and -1 task number; no labels were pushed because the issue
    // carries none.
    expect(m.createComment).toHaveBeenCalledTimes(2);
    const bodies = m.createComment.mock.calls.map(
      (call) => (call[0] as { body: string }).body,
    );
    const topic = (slug: string) => `[${slug.toUpperCase()}-1](`;
    expect(bodies.some((body) => body.includes(topic(first.project.slug))))
      .toBe(true);
    expect(
      bodies.some((body) => body.includes(topic(second.project.slug))),
    ).toBe(true);
    expect(m.getRepoInstallation).not.toHaveBeenCalled();
  });

  it("numbers follow-up issues per project, not per repository", async () => {
    const first = await ownerWithProject();
    const second = await ownerWithProject();
    await insertGithubBinding(first.project.id, first.owner.user.id);
    await insertGithubBinding(second.project.id, second.owner.user.id);

    await handleIssueOpened(issueOpenedPayload(7));
    await handleIssueOpened(issueOpenedPayload(8));

    for (const context of [first, second] as const) {
      const tasks = await tasksOf(context.project.id);
      expect(tasks.map((task) => task.number).sort((a, b) => a - b)).toEqual([
        1, 2,
      ]);
    }
    // Issue 8 created its own link per binding.
    expect(m.createComment).toHaveBeenCalledTimes(4);
    const commentBodies = m.createComment.mock.calls.map(
      (call) => (call[0] as { body: string }).body,
    );
    expect(
      commentBodies.filter((body) => body.includes("-2](")),
    ).toHaveLength(2);
  });
});
