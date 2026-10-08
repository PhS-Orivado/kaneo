import { sendWorkspaceInvitationEmail } from "@kaneo/email";
import { eq } from "drizzle-orm";
import db, { schema } from "../database";
import { getInvitationEmailSubject } from "./get-invitation-email-subject";
import { getWorkspaceInvitationEmailCopy } from "./get-workspace-invitation-email-copy";

// Mirrors EmailResult from @kaneo/email, which does not export the type.
export type InvitationEmailResult = {
  success: boolean;
  reason?: "SMTP_NOT_CONFIGURED";
};

export async function getUserLocale(email: string) {
  const [user] = await db
    .select({ locale: schema.userTable.locale })
    .from(schema.userTable)
    .where(eq(schema.userTable.email, email))
    .limit(1);

  return user?.locale ?? null;
}

/**
 * Sends the standard workspace invitation email for an existing invitation.
 * Shared by Better Auth's sendInvitationEmail callback and the bulk
 * invitation endpoint, so both paths produce the same message.
 *
 * Returns the delivery result instead of throwing on SMTP problems, so
 * callers can decide how a failure is reported; transport errors still
 * propagate from the email package.
 */
export async function sendInvitationEmailToInvitation(invitation: {
  id: string;
  email: string;
  inviter: { name: string; email: string };
  workspace: { name: string };
}): Promise<InvitationEmailResult> {
  const inviteLink = `${process.env.KANEO_CLIENT_URL}/invitation/accept/${invitation.id}`;
  const locale = await getUserLocale(invitation.email);
  const copy = getWorkspaceInvitationEmailCopy(locale);

  return sendWorkspaceInvitationEmail(
    invitation.email,
    getInvitationEmailSubject(
      locale,
      invitation.inviter.name,
      invitation.workspace.name,
    ),
    {
      inviterEmail: invitation.inviter.email,
      inviterName: invitation.inviter.name,
      workspaceName: invitation.workspace.name,
      invitationLink: inviteLink,
      to: invitation.email,
      copy,
    },
  );
}
