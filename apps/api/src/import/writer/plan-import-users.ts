import type { ImportedPerson } from "@kaneo/importers";
import type { AssignableMember } from "./match-assignees";

export type ImportUserHandling = "invite" | "create";

export type PlannedImportUser = {
  name: string | null;
  email: string;
};

function normalize(value: string | null | undefined) {
  return value?.normalize("NFKC").trim().toLowerCase() ?? "";
}

// People from the source who are not workspace members yet, deduplicated by
// email. Only people with an email can be invited or given an account;
// name-only people keep the existing unmatched-assignee warning instead.
export function planImportUsers(
  members: readonly AssignableMember[],
  persons: readonly (ImportedPerson | undefined)[],
): PlannedImportUser[] {
  const byEmail = new Set<string>();
  const byName = new Map<string, string | null>();
  for (const member of members) {
    const email = normalize(member.email);
    if (email) byEmail.add(email);
    const name = normalize(member.name);
    if (name) byName.set(name, byName.has(name) ? null : member.id);
  }

  const planned: PlannedImportUser[] = [];
  const seen = new Set<string>();
  for (const person of persons) {
    if (!person) continue;
    const email = normalize(person.email);
    if (email) {
      if (byEmail.has(email) || seen.has(email)) continue;
      seen.add(email);
      planned.push({
        name: person.name?.trim() || null,
        email: person.email.trim(),
      });
      continue;
    }
    // No email: reachable only when the name matches a member exactly the
    // way the assignee matcher does, so nothing to invite or create.
  }
  return planned;
}
