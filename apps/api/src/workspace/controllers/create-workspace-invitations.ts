import { createId } from "@paralleldrive/cuid2";
import { and, eq, inArray } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { isAssignableWorkspaceRole } from "../../admin/is-assignable-workspace-role";
import db from "../../database";
import {
  invitationTable,
  userTable,
  workspaceTable,
  workspaceUserTable,
} from "../../database/schema";
import { sendInvitationEmailToInvitation } from "../../utils/send-invitation-email";

// Better Auth's organization plugin keeps invitations alive for 48 hours by
// default (invitationExpiresIn = 3600 * 48); invitations created in bulk use
// the same window so they behave exactly like invitations sent from the app.
const INVITATION_EXPIRY_MS = 48 * 60 * 60 * 1000;

// Same pending-invitation limit Better Auth enforces per workspace.
const PENDING_INVITATION_LIMIT = 100;

export type WorkspaceInvitationRequestItem = {
  email: string;
  sendEmail: boolean;
};

export type WorkspaceInvitationResultItem = {
  email: string;
  status: "created" | "already_member" | "already_invited" | "error";
  id?: string;
  expiresAt?: string;
  emailed: boolean;
  error?: string;
};

/**
 * Creates pending workspace invitations without the email blast of the
 * app's invite flow: an email is only sent for addresses the caller marks
 * with sendEmail, and every result carries the invitation id so the links
 * can be shared manually. Rows are written exactly like Better Auth's
 * inviteMember writes them, so acceptance keeps working unchanged.
 */
async function createWorkspaceInvitations({
  workspaceId,
  actorId,
  role,
  invitations,
}: {
  workspaceId: string;
  actorId: string;
  role: string;
  invitations: WorkspaceInvitationRequestItem[];
}): Promise<{ invitations: WorkspaceInvitationResultItem[] }> {
  const [workspace] = await db
    .select({ id: workspaceTable.id, name: workspaceTable.name })
    .from(workspaceTable)
    .where(eq(workspaceTable.id, workspaceId))
    .limit(1);

  if (!workspace) {
    throw new HTTPException(404, { message: "Workspace not found" });
  }

  const [inviter] = await db
    .select({ name: userTable.name, email: userTable.email })
    .from(userTable)
    .where(eq(userTable.id, actorId))
    .limit(1);

  if (!inviter) {
    throw new HTTPException(404, { message: "User not found" });
  }

  if (!(await isAssignableWorkspaceRole(db, workspaceId, role))) {
    throw new HTTPException(400, {
      message:
        "Unknown role. To make someone the owner, add them and then transfer ownership",
    });
  }

  // Lowercase like inviteMember does; a repeated email merges into one
  // invitation and sendEmail wins over the quieter duplicates.
  const requested = new Map<string, boolean>();
  for (const item of invitations) {
    const email = item.email.trim().toLowerCase();
    requested.set(email, (requested.get(email) ?? false) || item.sendEmail);
  }

  const emails = [...requested.keys()];
  if (emails.length === 0) {
    return { invitations: [] };
  }

  const memberEmails = new Set(
    (
      await db
        .select({ email: userTable.email })
        .from(workspaceUserTable)
        .innerJoin(userTable, eq(userTable.id, workspaceUserTable.userId))
        .where(eq(workspaceUserTable.workspaceId, workspaceId))
    )
      .map((member) => member.email?.trim().toLowerCase() ?? "")
      .filter(Boolean),
  );

  // Better Auth treats expired pending invitations as gone; only unexpired
  // ones block a new invitation.
  const pendingRows = (
    await db
      .select()
      .from(invitationTable)
      .where(
        and(
          eq(invitationTable.workspaceId, workspaceId),
          eq(invitationTable.status, "pending"),
          inArray(invitationTable.email, emails),
        ),
      )
  ).filter((row) => row.expiresAt > new Date());
  const pendingByEmail = new Map(pendingRows.map((row) => [row.email, row]));

  const now = new Date();
  const pendingCount = (
    await db
      .select({ expiresAt: invitationTable.expiresAt })
      .from(invitationTable)
      .where(
        and(
          eq(invitationTable.workspaceId, workspaceId),
          eq(invitationTable.status, "pending"),
        ),
      )
  ).filter((row) => row.expiresAt > now).length;

  const results: WorkspaceInvitationResultItem[] = [];
  let pendingAfter = pendingCount;

  for (const [email, sendEmail] of requested) {
    if (memberEmails.has(email)) {
      results.push({ email, status: "already_member", emailed: false });
      continue;
    }

    const existing = pendingByEmail.get(email);
    if (existing) {
      const result: WorkspaceInvitationResultItem = {
        email,
        status: "already_invited",
        id: existing.id,
        expiresAt: existing.expiresAt.toISOString(),
        emailed: false,
      };

      // Only a resend refreshes the expiry, like Better Auth's resend does.
      if (sendEmail) {
        const expiresAt = new Date(Date.now() + INVITATION_EXPIRY_MS);
        await db
          .update(invitationTable)
          .set({ expiresAt })
          .where(eq(invitationTable.id, existing.id));
        result.expiresAt = expiresAt.toISOString();

        await deliverInvitationEmail({
          result,
          invitationId: existing.id,
          email,
          inviter,
          workspace,
        });
      }
      results.push(result);
      continue;
    }

    if (pendingAfter >= PENDING_INVITATION_LIMIT) {
      results.push({
        email,
        status: "error",
        emailed: false,
        error: `Invitation limit reached (${PENDING_INVITATION_LIMIT} pending invitations).`,
      });
      continue;
    }

    const id = createId();
    const expiresAt = new Date(Date.now() + INVITATION_EXPIRY_MS);
    await db.insert(invitationTable).values({
      id,
      workspaceId,
      email,
      role,
      status: "pending",
      expiresAt,
      inviterId: actorId,
      projectAccess: "all",
      projectIds: [],
    });
    pendingAfter++;

    const result: WorkspaceInvitationResultItem = {
      email,
      status: "created",
      id,
      expiresAt: expiresAt.toISOString(),
      emailed: false,
    };

    if (sendEmail) {
      await deliverInvitationEmail({
        result,
        invitationId: id,
        email,
        inviter,
        workspace,
      });
    }
    results.push(result);
  }

  return { invitations: results };
}

// The invitation exists regardless of the delivery outcome; failures are
// reported on the item instead of failing the whole request, so a bulk
// migration keeps going when SMTP hiccups.
async function deliverInvitationEmail({
  result,
  invitationId,
  email,
  inviter,
  workspace,
}: {
  result: WorkspaceInvitationResultItem;
  invitationId: string;
  email: string;
  inviter: { name: string; email: string };
  workspace: { name: string };
}): Promise<void> {
  try {
    const delivered = await sendInvitationEmailToInvitation({
      id: invitationId,
      email,
      inviter,
      workspace,
    });

    if (delivered?.success === false) {
      console.warn(
        `Invitation for ${email} created but not sent due to SMTP not being configured`,
      );
      return;
    }

    result.emailed = true;
  } catch (error) {
    result.error =
      "Invitation created, but the invitation email could not be sent.";
    console.error("Error sending workspace invitation email", error);
  }
}

export default createWorkspaceInvitations;
