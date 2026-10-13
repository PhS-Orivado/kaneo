import type { JiraUser } from "./jira.js";
import { displayName } from "./mapping.js";

export type InvitationCandidate = {
  email: string;
  name: string;
};

export type InvitationPlan = {
  // Jira users with an email who are not workspace members yet.
  candidates: InvitationCandidate[];
  // Addresses already belonging to a workspace member; they need no
  // invitation and the API would report them as already_member anyway.
  alreadyMembers: string[];
  // Display names of Jira users without an email address; they cannot be
  // invited, so they are surfaced instead of being dropped silently.
  withoutEmail: string[];
};

/**
 * Turns the Jira users seen during a migration into an invitation plan:
 * everyone with an email who is not already a member becomes a candidate,
 * duplicates collapse by address, and anyone without an email is reported.
 */
export function planInvitations(
  users: Iterable<JiraUser>,
  memberEmails: Iterable<string>,
): InvitationPlan {
  const members = new Set(
    [...memberEmails]
      .map((email) => email?.trim().toLowerCase() ?? "")
      .filter(Boolean),
  );

  const candidates = new Map<string, InvitationCandidate>();
  const alreadyMembers = new Set<string>();
  const withoutEmail = new Map<string, string>();

  for (const user of users) {
    const email = user.emailAddress?.trim().toLowerCase() ?? "";
    const name = displayName(user);

    if (!email) {
      // Dedupe by Jira identity; the display name is only for the report.
      const identity = user.accountId ?? user.key ?? name;
      if (identity && !withoutEmail.has(identity)) {
        withoutEmail.set(identity, name);
      }
      continue;
    }

    if (members.has(email)) {
      alreadyMembers.add(email);
      continue;
    }

    if (!candidates.has(email)) {
      candidates.set(email, { email, name });
    }
  }

  return {
    candidates: [...candidates.values()].sort(byNameAndEmail),
    alreadyMembers: [...alreadyMembers].sort(),
    withoutEmail: [...withoutEmail.values()].sort(),
  };
}

function byNameAndEmail(
  a: InvitationCandidate,
  b: InvitationCandidate,
): number {
  return a.name.localeCompare(b.name) || a.email.localeCompare(b.email);
}

/**
 * Applies a non-interactive --invite-emails selection: known addresses are
 * emailed, unknown ones are reported instead of being silently ignored.
 */
export function selectEmailedEmails(
  candidates: InvitationCandidate[],
  requested: string[],
): { selected: string[]; unknown: string[] } {
  const known = new Set(candidates.map((candidate) => candidate.email));
  const selected: string[] = [];
  const unknown: string[] = [];

  for (const raw of requested) {
    const email = raw.trim().toLowerCase();
    if (!email) continue;

    if (known.has(email)) {
      if (!selected.includes(email)) selected.push(email);
    } else if (!unknown.includes(email)) {
      unknown.push(email);
    }
  }

  return { selected, unknown };
}

/**
 * Builds the public URL an invitee opens to accept a workspace invitation;
 * mirrors apps/web/src/lib/invitation-link.ts, which prefers a working origin
 * over the server-side KANEO_CLIENT_URL.
 */
export function invitationLink(baseUrl: string, invitationId: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/invitation/accept/${invitationId}`;
}
