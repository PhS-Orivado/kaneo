import { and, eq, gt } from "drizzle-orm";
import { sendWorkspaceInvitationEmail } from "@kaneo/email";
import type db from "../../database";
import {
  invitationTable,
  userTable,
  workspaceTable,
  workspaceUserTable,
} from "../../database/schema";
import { getInvitationEmailSubject } from "../../utils/get-invitation-email-subject";
import {
  getInvitationRoleLabel,
  getWorkspaceInvitationEmailCopy,
} from "../../utils/get-workspace-invitation-email-copy";
import type { AssignableMember } from "./match-assignees";
import type { ImportUserHandling, PlannedImportUser } from "./plan-import-users";

type Transaction = Parameters<Parameters<typeof db.transaction>[0][0]>;

const INVITATION_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

export type WriteImportUsersInput = {
  workspaceId: string;
  userId: string;
  handling: ImportUserHandling;
  users: readonly PlannedImportUser[];
};

export type WriteImportUsersResult = {
  // Created accounts, usable for assignment right away. Invited people have
  // no account yet, so they stay out of this list and their tasks unassigned.
  members: AssignableMember[];
  users: number;
  warnings: string[];
};

async function getUserLocale(tx: Transaction, email: string) {
  const [user] = await tx
    .select({ locale: userTable.locale })
    .from(userTable)
    .where(eq(userTable.email, email))
    .limit(1);
  return user?.locale ?? null;
}

// shortcut: emails go out before the transaction commits; a fast invitee
// could open an invitation the import later rolled back. Acceptable because
// the invitation only references the workspace, not the imported project.
async function sendInvitationEmail(
  tx: Transaction,
  input: {
    workspaceId: string;
    inviterId: string;
    invitationId: string;
    expiresAt: Date;
    person: PlannedImportUser;
  },
) {
  const [workspace] = await tx
    .select({ name: workspaceTable.name })
    .from(workspaceTable)
    .where(eq(workspaceTable.id, input.workspaceId))
    .limit(1);
  const [inviter] = await tx
    .select({ name: userTable.name, email: userTable.email })
    .from(userTable)
    .where(eq(userTable.id, input.inviterId))
    .limit(1);
  if (!workspace || !inviter) return;

  const locale = await getUserLocale(tx, input.person.email);
  const link = `${process.env.KANEO_CLIENT_URL}/invitation/accept/${input.invitationId}`;
  const result = await sendWorkspaceInvitationEmail(
    input.person.email,
    getInvitationEmailSubject(locale, inviter.name, workspace.name),
    {
      inviterEmail: inviter.email,
      inviterName: inviter.name,
      workspaceName: workspace.name,
      invitationLink: link,
      to: input.person.email,
      locale,
      role: getInvitationRoleLabel(locale, "member"),
      expiresAt: input.expiresAt,
      copy: getWorkspaceInvitationEmailCopy(locale),
    },
  );
  if (result?.success === false) {
    console.warn(
      `Import invitation for ${input.person.email} was created but the email was not sent (${result.reason}).`,
    );
  }
}

async function inviteUsers(
  tx: Transaction,
  input: WriteImportUsersInput,
): Promise<WriteImportUsersResult> {
  const now = new Date();
  const warnings: string[] = [];
  let count = 0;

  for (const person of input.users) {
    const existing = await tx
      .select({ id: invitationTable.id })
      .from(invitationTable)
      .where(
        and(
          eq(invitationTable.workspaceId, input.workspaceId),
          eq(invitationTable.email, person.email),
          eq(invitationTable.status, "pending"),
          gt(invitationTable.expiresAt, now),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      count++;
      continue;
    }

    const expiresAt = new Date(now.getTime() + INVITATION_EXPIRY_MS);
    const [invitation] = await tx
      .insert(invitationTable)
      .values({
        workspaceId: input.workspaceId,
        email: person.email,
        role: "member",
        status: "pending",
        expiresAt,
        inviterId: input.userId,
        projectAccess: "all",
        projectIds: [],
      })
      .returning({ id: invitationTable.id });

    await sendInvitationEmail(tx, {
      workspaceId: input.workspaceId,
      inviterId: input.userId,
      invitationId: invitation.id,
      expiresAt,
      person,
    });
    count++;
  }

  return { members: [], users: count, warnings };
}

async function createUsers(
  tx: Transaction,
  input: WriteImportUsersInput,
): Promise<WriteImportUsersResult> {
  const members: AssignableMember[] = [];
  const now = new Date();

  for (const person of input.users) {
    const [existing] = await tx
      .select({ id: userTable.id, name: userTable.name, email: userTable.email })
      .from(userTable)
      .where(eq(userTable.email, person.email))
      .limit(1);

    const user =
      existing ??
      (
        await tx
          .insert(userTable)
          .values({
            name: person.name ?? person.email.split("@")[0],
            email: person.email,
            // No credential is set: the person signs in with their email
            // through the existing magic link or sign-in code flow.
            emailVerified: false,
          })
          .returning({
            id: userTable.id,
            name: userTable.name,
            email: userTable.email,
          })
      )[0];

    await tx
      .insert(workspaceUserTable)
      .values({
        workspaceId: input.workspaceId,
        userId: user.id,
        role: "member",
        joinedAt: now,
      })
      .onConflictDoNothing();

    members.push({ id: user.id, name: user.name, email: user.email });
  }

  return { members, users: members.length, warnings: [] };
}

export async function writeImportUsers(
  tx: Transaction,
  input: WriteImportUsersInput,
): Promise<WriteImportUsersResult> {
  return input.handling === "create"
    ? createUsers(tx, input)
    : inviteUsers(tx, input);
}
