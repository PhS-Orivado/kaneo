import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { resolveTargetStatus } from "../../apps/api/src/plugins/gitea/utils/resolve-column";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import {
  createProjectFixture,
  createWorkspaceMember,
} from "./helpers/fixtures";

// RFC 0001 WP6: workflow rules may target one repository binding
// (integration_id set) while type-wide rules (integration_id NULL) keep the
// legacy project-wide semantics. Resolution prefers the repository-specific
// rule of the addressed binding and falls back to the type-wide rule.
beforeEach(async () => {
  await resetTestDatabase();
});

async function insertBinding(projectId: string, repositoryName: string) {
  const [row] = await db
    .insert(schema.integrationTable)
    .values({
      projectId,
      type: "gitea",
      isActive: true,
      repositoryKey: `gitea:https://git.example/team/${repositoryName}`,
      config: JSON.stringify({
        baseUrl: "https://git.example",
        accessToken: "test-only",
        repositoryOwner: "team",
        repositoryName,
      }),
    })
    .returning();
  return row!;
}

async function ownerWithProject() {
  const member = await createWorkspaceMember({ role: "owner" });
  const { project, columns } = await createProjectFixture({
    workspaceId: member.workspace.id,
  });
  mockAuthenticatedSession(member.user);
  const { app } = createApp();
  return { member, project, columns, app };
}

const upsert = (
  app: ReturnType<typeof createApp>["app"],
  projectId: string,
  body: Record<string, unknown>,
) =>
  app.request(`/api/workflow-rule/${projectId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

describe("Workflow rules per repository binding (RFC 0001 WP6)", () => {
  it("keeps a type-wide rule and a repository-specific rule as separate rows", async () => {
    const { project, columns, app } = await ownerWithProject();
    const first = await insertBinding(project.id, "repo-a");
    await insertBinding(project.id, "repo-b");

    const typeWide = await upsert(app, project.id, {
      integrationType: "gitea",
      eventType: "issue_closed",
      columnId: columns.inReview.id,
    });
    expect(typeWide.status).toBe(200);
    expect((await typeWide.json()).integrationId).toBeNull();

    const specific = await upsert(app, project.id, {
      integrationType: "gitea",
      eventType: "issue_closed",
      columnId: columns.done.id,
      integrationId: first.id,
    });
    expect(specific.status).toBe(200);
    expect((await specific.json()).integrationId).toBe(first.id);

    // Updating the specific rule again rewrites its row, not a third one.
    const updated = await upsert(app, project.id, {
      integrationType: "gitea",
      eventType: "issue_closed",
      columnId: columns.todo.id,
      integrationId: first.id,
    });
    expect(updated.status).toBe(200);

    const rows = await db
      .select()
      .from(schema.workflowRuleTable)
      .where(eq(schema.workflowRuleTable.projectId, project.id));
    expect(rows).toHaveLength(2);
    const scoped = rows.find((row) => row.integrationId === first.id);
    expect(scoped).toMatchObject({ columnId: columns.todo.id });
    const wide = rows.find((row) => row.integrationId === null);
    expect(wide).toMatchObject({ columnId: columns.inReview.id });

    const list = await app.request(`/api/workflow-rule/${project.id}`);
    expect(list.status).toBe(200);
    const rules = (await list.json()) as Array<{
      integrationId: string | null;
    }>;
    expect(rules).toHaveLength(2);
    expect(new Set(rules.map((rule) => rule.integrationId))).toEqual(
      new Set([null, first.id]),
    );
  });

  it("prefers the repository-specific rule and falls back for sibling bindings", async () => {
    const { project, columns, app } = await ownerWithProject();
    const first = await insertBinding(project.id, "repo-a");
    const second = await insertBinding(project.id, "repo-b");
    expect(
      (
        await upsert(app, project.id, {
          integrationType: "gitea",
          eventType: "issue_closed",
          columnId: columns.inReview.id,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await upsert(app, project.id, {
          integrationType: "gitea",
          eventType: "issue_closed",
          columnId: columns.done.id,
          integrationId: first.id,
        })
      ).status,
    ).toBe(200);

    // The specific rule wins for its own binding.
    expect(
      await resolveTargetStatus(
        project.id,
        "issue_closed",
        "done",
        db,
        first.id,
      ),
    ).toBe("done");
    // The sibling binding falls back to the type-wide rule.
    expect(
      await resolveTargetStatus(
        project.id,
        "issue_closed",
        "done",
        db,
        second.id,
      ),
    ).toBe("in-review");
    // Callers without binding context keep the type-wide behavior.
    expect(
      await resolveTargetStatus(project.id, "issue_closed", "done", db),
    ).toBe("in-review");
  });

  it("rejects rules that target a foreign project, a wrong type, or an unknown integration", async () => {
    const { member, project, columns, app } = await ownerWithProject();
    const { project: otherProject } = await createProjectFixture({
      workspaceId: member.workspace.id,
    });
    const foreignBinding = await insertBinding(otherProject.id, "repo-x");
    const ownBinding = await insertBinding(project.id, "repo-a");
    const outsider = await createWorkspaceMember({ role: "owner" });
    const { project: outsiderProject } = await createProjectFixture({
      workspaceId: outsider.workspace.id,
    });
    const outsiderBinding = await insertBinding(
      outsiderProject.id,
      "repo-y",
    );

    // A binding of another project in the same workspace: 400.
    expect(
      (
        await upsert(app, project.id, {
          integrationType: "gitea",
          eventType: "issue_closed",
          columnId: columns.done.id,
          integrationId: foreignBinding.id,
        })
      ).status,
    ).toBe(400);

    // The rule's integration type must match the binding's type: 400.
    expect(
      (
        await upsert(app, project.id, {
          integrationType: "github",
          eventType: "issue_closed",
          columnId: columns.done.id,
          integrationId: ownBinding.id,
        })
      ).status,
    ).toBe(400);

    // A foreign-workspace binding is rejected by the route's access check.
    expect(
      (
        await upsert(app, project.id, {
          integrationType: "gitea",
          eventType: "issue_closed",
          columnId: columns.done.id,
          integrationId: outsiderBinding.id,
        })
      ).status,
    ).toBe(403);

    // An unknown integration id is a 404.
    expect(
      (
        await upsert(app, project.id, {
          integrationType: "gitea",
          eventType: "issue_closed",
          columnId: columns.done.id,
          integrationId: randomUUID(),
        })
      ).status,
    ).toBe(404);

    expect(
      await db
        .select()
        .from(schema.workflowRuleTable)
        .where(eq(schema.workflowRuleTable.projectId, project.id)),
    ).toHaveLength(0);
  });

  it("removes only the binding's repository-specific rules on cascade delete", async () => {
    const { project, columns, app } = await ownerWithProject();
    const first = await insertBinding(project.id, "repo-a");
    const second = await insertBinding(project.id, "repo-b");
    await upsert(app, project.id, {
      integrationType: "gitea",
      eventType: "issue_closed",
      columnId: columns.inReview.id,
    });
    await upsert(app, project.id, {
      integrationType: "gitea",
      eventType: "issue_closed",
      columnId: columns.done.id,
      integrationId: first.id,
    });
    await upsert(app, project.id, {
      integrationType: "gitea",
      eventType: "issue_closed",
      columnId: columns.todo.id,
      integrationId: second.id,
    });
    expect(
      await db
        .select()
        .from(schema.workflowRuleTable)
        .where(eq(schema.workflowRuleTable.projectId, project.id)),
    ).toHaveLength(3);

    await db
      .delete(schema.integrationTable)
      .where(eq(schema.integrationTable.id, first.id));

    const rows = await db
      .select()
      .from(schema.workflowRuleTable)
      .where(eq(schema.workflowRuleTable.projectId, project.id));
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.integrationId === first.id)).toBeUndefined();
    expect(
      rows.find((row) => row.integrationId === null),
    ).toMatchObject({ columnId: columns.inReview.id });
    expect(
      rows.find((row) => row.integrationId === second.id),
    ).toMatchObject({ columnId: columns.todo.id });
  });

  it("carries different rules per project binding for a shared repository (decision D1)", async () => {
    const { member, project, columns, app } = await ownerWithProject();
    const { project: otherProject, columns: otherColumns } =
      await createProjectFixture({ workspaceId: member.workspace.id });
    const first = await insertBinding(project.id, "shared");
    const second = await insertBinding(otherProject.id, "shared");
    expect(first.repositoryKey).toBe(second.repositoryKey);

    expect(
      (
        await upsert(app, project.id, {
          integrationType: "gitea",
          eventType: "issue_closed",
          columnId: columns.inReview.id,
          integrationId: first.id,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await upsert(app, otherProject.id, {
          integrationType: "gitea",
          eventType: "issue_closed",
          columnId: otherColumns.done.id,
          integrationId: second.id,
        })
      ).status,
    ).toBe(200);

    // Resolution is keyed by the integration row, not the repository key:
    // the same shared repository behaves differently per project binding.
    expect(
      await resolveTargetStatus(project.id, "issue_closed", "done", db, first.id),
    ).toBe("in-review");
    expect(
      await resolveTargetStatus(
        otherProject.id,
        "issue_closed",
        "done",
        db,
        second.id,
      ),
    ).toBe("done");
  });
});
