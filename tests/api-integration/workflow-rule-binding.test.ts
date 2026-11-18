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

// RFC 0001 WP6: workflow rules gained an optional integrationId so a rule can
// target a single repository binding while a type-wide rule (integration_id
// NULL) keeps the legacy semantics. These suites cover the NULL-aware upsert,
// the resolution precedence, the binding-related validation errors, and the
// authorization matrix.

async function ownerWithProject() {
  const member = await createWorkspaceMember({ role: "owner" });
  const { project, columns } = await createProjectFixture({
    workspaceId: member.workspace.id,
  });
  return { owner: member, project, columns };
}

async function addWorkspaceMember(
  workspaceId: string,
  role: "member" | "viewer",
) {
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
    role,
    joinedAt: new Date(),
  });
  return user!;
}

async function insertBinding(projectId: string, type = "gitea") {
  const [binding] = await db
    .insert(schema.integrationTable)
    .values({
      projectId,
      type,
      config: JSON.stringify({}),
      repositoryKey: `${type}:example/acme`,
      isActive: true,
    })
    .returning();
  return binding!;
}

function upsertRule(
  app: ReturnType<typeof createApp>["app"],
  projectId: string,
  body: {
    integrationType: string;
    eventType: string;
    columnId: string;
    integrationId?: string;
  },
) {
  return app.request(`/api/workflow-rule/${projectId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(async () => {
  await resetTestDatabase();
});

describe("Workflow rules scoped to repository bindings (RFC 0001 WP6)", () => {
  it("keeps type-wide and repository-scoped rules for the same event separate", async () => {
    const { owner, project, columns } = await ownerWithProject();
    const bindingA = await insertBinding(project.id, "gitea");
    const bindingB = await insertBinding(project.id, "gitea");
    mockAuthenticatedSession(owner.user);
    const { app } = createApp();

    const typeWide = await upsertRule(app, project.id, {
      integrationType: "gitea",
      eventType: "issue_opened",
      columnId: columns.todo.id,
    });
    expect(typeWide.status).toBe(200);
    expect(await typeWide.json()).toMatchObject({
      integrationId: null,
      eventType: "issue_opened",
      columnId: columns.todo.id,
    });

    const scopedA = await upsertRule(app, project.id, {
      integrationType: "gitea",
      eventType: "issue_opened",
      columnId: columns.inReview.id,
      integrationId: bindingA.id,
    });
    expect(scopedA.status).toBe(200);
    expect(await scopedA.json()).toMatchObject({
      integrationId: bindingA.id,
      columnId: columns.inReview.id,
    });

    const scopedB = await upsertRule(app, project.id, {
      integrationType: "gitea",
      eventType: "issue_opened",
      columnId: columns.inProgress.id,
      integrationId: bindingB.id,
    });
    expect(scopedB.status).toBe(200);

    expect(await db.query.workflowRuleTable.findMany()).toHaveLength(3);

    // Re-sending each variant updates its own row instead of creating a
    // sibling, thanks to the NULL-aware lookup key.
    await upsertRule(app, project.id, {
      integrationType: "gitea",
      eventType: "issue_opened",
      columnId: columns.done.id,
    });
    await upsertRule(app, project.id, {
      integrationType: "gitea",
      eventType: "issue_opened",
      columnId: columns.done.id,
      integrationId: bindingA.id,
    });
    await upsertRule(app, project.id, {
      integrationType: "gitea",
      eventType: "issue_opened",
      columnId: columns.done.id,
      integrationId: bindingB.id,
    });
    expect(await db.query.workflowRuleTable.findMany()).toHaveLength(3);

    const listResponse = await app.request(`/api/workflow-rule/${project.id}`);
    expect(listResponse.status).toBe(200);
    const list = (await listResponse.json()) as {
      integrationId: string | null;
      columnSlug: string | null;
    }[];
    expect(list).toHaveLength(3);
    expect(
      list.filter((rule) => rule.integrationId === null),
    ).toHaveLength(1);
    expect(
      list.filter((rule) => rule.integrationId === bindingA.id),
    ).toHaveLength(1);
    expect(
      list.filter((rule) => rule.integrationId === bindingB.id),
    ).toHaveLength(1);
    expect(list.every((rule) => rule.columnSlug === "done")).toBe(true);
  });

  it("prefers the binding-scoped rule, then the type-wide rule, then the fallback", async () => {
    const { project, columns } = await ownerWithProject();
    const bindingA = await insertBinding(project.id, "gitea");
    const bindingB = await insertBinding(project.id, "gitea");
    await db.insert(schema.workflowRuleTable).values([
      {
        projectId: project.id,
        integrationType: "gitea",
        eventType: "issue_opened",
        columnId: columns.inProgress.id,
        integrationId: null,
      },
      {
        projectId: project.id,
        integrationType: "gitea",
        eventType: "issue_opened",
        columnId: columns.inReview.id,
        integrationId: bindingA.id,
      },
    ]);

    // Repository-specific rule wins for its own binding...
    expect(
      await resolveTargetStatus(project.id, "issue_opened", "to-do", db, {
        id: bindingA.id,
      }),
    ).toBe("in-review");
    // ...while a sibling binding without a specific rule falls back to the
    // type-wide rule, as does a caller without binding context.
    expect(
      await resolveTargetStatus(project.id, "issue_opened", "to-do", db, {
        id: bindingB.id,
      }),
    ).toBe("in-progress");
    expect(
      await resolveTargetStatus(project.id, "issue_opened", "to-do", db, null),
    ).toBe("in-progress");
    expect(
      await resolveTargetStatus(project.id, "issue_opened", "to-do", db),
    ).toBe("in-progress");
    // Events without any rule keep the caller's fallback status.
    expect(
      await resolveTargetStatus(project.id, "branch_push", "done", db, {
        id: bindingA.id,
      }),
    ).toBe("done");
  });

  it("rejects scoped rules that reference unusable bindings or columns", async () => {
    const { owner, project, columns } = await ownerWithProject();
    const foreign = await ownerWithProject();
    const foreignBinding = await insertBinding(foreign.project.id, "gitea");
    const gitlabBinding = await insertBinding(project.id, "gitlab");
    mockAuthenticatedSession(owner.user);
    const { app } = createApp();

    const missing = await upsertRule(app, project.id, {
      integrationType: "gitea",
      eventType: "issue_opened",
      columnId: columns.todo.id,
      integrationId: "does-not-exist",
    });
    expect(missing.status).toBe(404);

    // A foreign binding never reaches the controller validation: the
    // workspace-access lookup rejects it first.
    const foreignResponse = await upsertRule(app, project.id, {
      integrationType: "gitea",
      eventType: "issue_opened",
      columnId: columns.todo.id,
      integrationId: foreignBinding.id,
    });
    expect([403, 404]).toContain(foreignResponse.status);

    const mismatched = await upsertRule(app, project.id, {
      integrationType: "gitea",
      eventType: "issue_opened",
      columnId: columns.todo.id,
      integrationId: gitlabBinding.id,
    });
    expect(mismatched.status).toBe(400);

    const foreignColumn = await upsertRule(app, project.id, {
      integrationType: "gitea",
      eventType: "issue_opened",
      columnId: foreign.columns.todo.id,
    });
    expect(foreignColumn.status).toBe(400);

    expect(await db.query.workflowRuleTable.findMany()).toHaveLength(0);
  });

  it("enforces the authorization matrix on the scoped and legacy routes", async () => {
    const { owner, project, columns } = await ownerWithProject();
    const binding = await insertBinding(project.id, "gitea");
    const member = await addWorkspaceMember(owner.workspace.id, "member");
    const outsider = await createWorkspaceMember({ role: "owner" });
    const scopedBody = {
      integrationType: "gitea",
      eventType: "issue_opened",
      columnId: columns.todo.id,
      integrationId: binding.id,
    };

    mockAuthenticatedSession(owner.user);
    const { app } = createApp();
    expect((await upsertRule(app, project.id, scopedBody)).status).toBe(200);
    const [rule] = await db.query.workflowRuleTable.findMany();
    expect(rule).toBeDefined();

    // Outsiders get 404 on the type-wide route and never learn that the
    // scoped binding or the rule exist.
    mockAuthenticatedSession(outsider.user);
    expect((await upsertRule(app, project.id, scopedBody)).status).toBe(404);
    expect(
      (
        await app.request(`/api/workflow-rule/${project.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            integrationType: "gitea",
            eventType: "branch_push",
            columnId: columns.todo.id,
          }),
        })
      ).status,
    ).toBe(404);
    expect(
      (await app.request(`/api/workflow-rule/${project.id}`)).status,
    ).toBe(404);
    expect(
      (
        await app.request(`/api/workflow-rule/${rule!.id}`, { method: "DELETE" })
      ).status,
    ).toBe(404);

    // Workspace members read the rules but cannot create, update, or delete.
    mockAuthenticatedSession(member);
    const listResponse = await app.request(`/api/workflow-rule/${project.id}`);
    expect(listResponse.status).toBe(200);
    expect((await listResponse.json()) as object[]).toHaveLength(1);
    expect((await upsertRule(app, project.id, scopedBody)).status).toBe(403);
    expect(
      (await app.request(`/api/workflow-rule/${rule!.id}`, { method: "DELETE" }))
        .status,
    ).toBe(403);

    // The owner deletes the scoped rule and gets it back.
    mockAuthenticatedSession(owner.user);
    const deleted = await app.request(`/api/workflow-rule/${rule!.id}`, {
      method: "DELETE",
    });
    expect(deleted.status).toBe(200);
    expect(await deleted.json()).toMatchObject({
      id: rule!.id,
      integrationId: binding.id,
    });
    expect(await db.query.workflowRuleTable.findMany()).toHaveLength(0);
  });
});
