import * as email from "@kaneo/email";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import db, { schema } from "../../apps/api/src/database";
import { createApp } from "../../apps/api/src/index";
import { mockAuthenticatedSession } from "./helpers/auth";
import { resetTestDatabase } from "./helpers/database";
import { createWorkspaceMember } from "./helpers/fixtures";

const origin = "http://localhost:5173";

type InvitationResult = {
  email: string;
  status: "created" | "already_member" | "already_invited" | "error";
  id?: string;
  expiresAt?: string;
  emailed: boolean;
  error?: string;
};

function postInvitations(
  app: ReturnType<typeof createApp>["app"],
  workspaceId: string,
  body: unknown,
) {
  return app.request(`/api/workspace/${workspaceId}/invitations`, {
    method: "POST",
    headers: { "content-type": "application/json", Origin: origin },
    body: JSON.stringify(body),
  });
}

describe("workspace bulk invitations", () => {
  beforeEach(async () => {
    await resetTestDatabase();
    vi.restoreAllMocks();
  });

  it("creates pending invitations without sending any email", async () => {
    const member = await createWorkspaceMember({ role: "owner" });
    const send = vi.spyOn(email, "sendWorkspaceInvitationEmail");

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await postInvitations(app, member.workspace.id, {
      invitations: [
        { email: "Alice@Example.com", sendEmail: false },
        { email: "bob@example.com", sendEmail: false },
      ],
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      invitations: InvitationResult[];
    };
    expect(body.invitations).toEqual([
      expect.objectContaining({
        email: "alice@example.com",
        status: "created",
        emailed: false,
        id: expect.any(String),
        expiresAt: expect.any(String),
      }),
      expect.objectContaining({
        email: "bob@example.com",
        status: "created",
        emailed: false,
      }),
    ]);
    expect(send).not.toHaveBeenCalled();

    const rows = await db.select().from(schema.invitationTable);
    expect(rows.map((row) => row.email).sort()).toEqual([
      "alice@example.com",
      "bob@example.com",
    ]);
    for (const row of rows) {
      expect(row.status).toBe("pending");
      expect(row.role).toBe("member");
      expect(row.projectAccess).toBe("all");
      expect(row.inviterId).toBe(member.user.id);
      expect(new Date(row.expiresAt).getTime()).toBeGreaterThan(Date.now());
    }
  });

  it("sends the invitation email only for addresses marked sendEmail", async () => {
    const member = await createWorkspaceMember({ role: "owner" });
    const send = vi.spyOn(email, "sendWorkspaceInvitationEmail");

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await postInvitations(app, member.workspace.id, {
      invitations: [
        { email: "alice@example.com", sendEmail: true },
        { email: "bob@example.com", sendEmail: false },
      ],
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      invitations: InvitationResult[];
    };
    const byEmail = new Map(
      body.invitations.map((invitation) => [invitation.email, invitation]),
    );
    expect(byEmail.get("alice@example.com")?.emailed).toBe(true);
    expect(byEmail.get("bob@example.com")?.emailed).toBe(false);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[0]).toBe("alice@example.com");
  });

  it("skips members and existing pending invitations instead of duplicating them", async () => {
    const member = await createWorkspaceMember({ role: "owner" });
    await db.insert(schema.invitationTable).values({
      id: "existing-invitation",
      workspaceId: member.workspace.id,
      email: "pending@example.com",
      role: "member",
      status: "pending",
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      inviterId: member.user.id,
      projectAccess: "all",
      projectIds: [],
    });

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await postInvitations(app, member.workspace.id, {
      invitations: [
        { email: member.user.email, sendEmail: false },
        { email: "pending@example.com", sendEmail: false },
        { email: "alice@example.com", sendEmail: false },
        { email: "ALICE@example.com", sendEmail: false },
      ],
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      invitations: InvitationResult[];
    };
    expect(body.invitations).toEqual([
      expect.objectContaining({
        email: member.user.email,
        status: "already_member",
        emailed: false,
      }),
      expect.objectContaining({
        email: "pending@example.com",
        status: "already_invited",
        id: "existing-invitation",
        emailed: false,
      }),
      expect.objectContaining({
        email: "alice@example.com",
        status: "created",
        emailed: false,
      }),
    ]);

    const rows = await db.select().from(schema.invitationTable);
    expect(rows).toHaveLength(2);
  });

  it("resends an existing invitation by refreshing its expiry and emailing it", async () => {
    const member = await createWorkspaceMember({ role: "owner" });
    const originalExpiry = new Date(Date.now() + 60 * 60 * 1000);
    await db.insert(schema.invitationTable).values({
      id: "existing-invitation",
      workspaceId: member.workspace.id,
      email: "pending@example.com",
      role: "member",
      status: "pending",
      expiresAt: originalExpiry,
      inviterId: member.user.id,
      projectAccess: "all",
      projectIds: [],
    });
    const send = vi.spyOn(email, "sendWorkspaceInvitationEmail");

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await postInvitations(app, member.workspace.id, {
      invitations: [{ email: "pending@example.com", sendEmail: true }],
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      invitations: InvitationResult[];
    };
    expect(body.invitations[0]).toMatchObject({
      email: "pending@example.com",
      status: "already_invited",
      id: "existing-invitation",
      emailed: true,
    });
    expect(send).toHaveBeenCalledTimes(1);

    const rows = await db.select().from(schema.invitationTable);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.expiresAt.getTime()).toBeGreaterThan(
      originalExpiry.getTime(),
    );
  });

  it("rejects members without invitation:create permission", async () => {
    const member = await createWorkspaceMember({ role: "member" });

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const response = await postInvitations(app, member.workspace.id, {
      invitations: [{ email: "alice@example.com", sendEmail: false }],
    });

    expect(response.status).toBe(403);
    expect(await db.select().from(schema.invitationTable)).toHaveLength(0);
  });

  it("rejects roles that cannot be assigned", async () => {
    const member = await createWorkspaceMember({ role: "owner" });

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const ownerRole = await postInvitations(app, member.workspace.id, {
      role: "owner",
      invitations: [{ email: "alice@example.com", sendEmail: false }],
    });
    expect(ownerRole.status).toBe(400);

    const unknownRole = await postInvitations(app, member.workspace.id, {
      role: "nope",
      invitations: [{ email: "alice@example.com", sendEmail: false }],
    });
    expect(unknownRole.status).toBe(400);
    expect(await db.select().from(schema.invitationTable)).toHaveLength(0);
  });

  it("rejects invalid bodies", async () => {
    const member = await createWorkspaceMember({ role: "owner" });

    mockAuthenticatedSession(member.user);
    const { app } = createApp();

    const empty = await postInvitations(app, member.workspace.id, {
      invitations: [],
    });
    expect(empty.status).toBe(400);

    const invalidEmail = await postInvitations(app, member.workspace.id, {
      invitations: [{ email: "not-an-email", sendEmail: false }],
    });
    expect(invalidEmail.status).toBe(400);
    expect(await db.select().from(schema.invitationTable)).toHaveLength(0);
  });
});
