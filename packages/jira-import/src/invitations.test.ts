import { describe, expect, it } from "vite-plus/test";
import type { JiraUser } from "./jira.js";
import {
  invitationLink,
  planInvitations,
  selectEmailedEmails,
} from "./invitations.js";

function user(overrides: Partial<JiraUser> = {}): JiraUser {
  return {
    accountId: "account-1",
    displayName: "Alice",
    emailAddress: "alice@example.com",
    ...overrides,
  };
}

describe("planInvitations", () => {
  it("invites users with an email who are not members", () => {
    const plan = planInvitations([user()], []);

    expect(plan.candidates).toEqual([
      { email: "alice@example.com", name: "Alice" },
    ]);
    expect(plan.alreadyMembers).toEqual([]);
    expect(plan.withoutEmail).toEqual([]);
  });

  it("skips existing members", () => {
    const plan = planInvitations([user()], ["ALICE@example.com"]);

    expect(plan.candidates).toEqual([]);
    expect(plan.alreadyMembers).toEqual(["alice@example.com"]);
  });

  it("reports users without an email instead of dropping them", () => {
    const plan = planInvitations(
      [user({ emailAddress: undefined, displayName: "Bot" })],
      [],
    );

    expect(plan.candidates).toEqual([]);
    expect(plan.withoutEmail).toEqual(["Bot"]);
  });

  it("collapses duplicates by email address", () => {
    const plan = planInvitations(
      [
        user({ accountId: "a", displayName: "Alice" }),
        user({ accountId: "b", key: "alice", displayName: "Alice Smith" }),
      ],
      [],
    );

    expect(plan.candidates).toHaveLength(1);
    expect(plan.candidates[0]?.email).toBe("alice@example.com");
  });

  it("dedupes users without an email by Jira identity", () => {
    const plan = planInvitations(
      [
        user({ emailAddress: undefined, displayName: "Bot" }),
        user({ emailAddress: undefined, displayName: "Bot" }),
      ],
      [],
    );

    expect(plan.withoutEmail).toEqual(["Bot"]);
  });

  it("sorts candidates and ignores empty member emails", () => {
    const plan = planInvitations(
      [user({ displayName: "Zoe", emailAddress: "zoe@example.com" }), user()],
      ["", "   "],
    );

    expect(plan.candidates.map((candidate) => candidate.email)).toEqual([
      "alice@example.com",
      "zoe@example.com",
    ]);
  });
});

describe("selectEmailedEmails", () => {
  const candidates = [
    { email: "alice@example.com", name: "Alice" },
    { email: "zoe@example.com", name: "Zoe" },
  ];

  it("selects known addresses case-insensitively", () => {
    const selection = selectEmailedEmails(candidates, [
      "ALICE@example.com",
      " zoe@example.com ",
    ]);

    expect(selection).toEqual({
      selected: ["alice@example.com", "zoe@example.com"],
      unknown: [],
    });
  });

  it("reports unknown addresses and skips duplicates", () => {
    const selection = selectEmailedEmails(candidates, [
      "alice@example.com",
      "alice@example.com",
      "nobody@example.com",
    ]);

    expect(selection).toEqual({
      selected: ["alice@example.com"],
      unknown: ["nobody@example.com"],
    });
  });
});

describe("invitationLink", () => {
  it("builds the accept URL and strips trailing slashes", () => {
    expect(invitationLink("https://kaneo.example/", "invite-1")).toBe(
      "https://kaneo.example/invitation/accept/invite-1",
    );
  });
});
