import type { ImportedPerson } from "@kaneo/importers";
import { describe, expect, it } from "vite-plus/test";
import type { AssignableMember } from "./match-assignees";
import { planImportUsers } from "./plan-import-users";

const member = (
  id: string,
  name: string,
  email: string,
): AssignableMember => ({ id, name, email });

const person = (
  name: string | undefined,
  email: string | undefined,
): ImportedPerson | undefined => ({ name, email });

describe("planImportUsers", () => {
  const members = [
    member("u1", "Ada Lovelace", "ada@example.com"),
    member("u2", "Grace Hopper", "grace@example.com"),
  ];

  it("returns nobody when everyone is already a member", () => {
    expect(
      planImportUsers(members, [person("Ada Lovelace", "ada@example.com")]),
    ).toEqual([]);
  });

  it("plans unknown people with their email and name", () => {
    expect(
      planImportUsers(members, [person("Alan Turing", "alan@example.com")]),
    ).toEqual([{ name: "Alan Turing", email: "alan@example.com" }]);
  });

  it("falls back to the email local part when the source has no name", () => {
    expect(
      planImportUsers(members, [person(undefined, "kay@example.com")]),
    ).toEqual([{ name: null, email: "kay@example.com" }]);
  });

  it("deduplicates people by email, keeping the first name", () => {
    expect(
      planImportUsers(members, [
        person("Alan Turing", "alan@example.com"),
        person("Alan M. Turing", "ALAN@example.com"),
      ]),
    ).toEqual([{ name: "Alan Turing", email: "alan@example.com" }]);
  });

  it("skips people without an email; they keep the unmatched warning", () => {
    expect(planImportUsers(members, [person("Mystery Person", undefined)])).toEqual(
      [],
    );
  });

  it("ignores undefined and empty people", () => {
    expect(
      planImportUsers(members, [undefined, person("", " \t")]),
    ).toEqual([]);
  });

  it("plans a person whose email is unknown even when a member shares the name", () => {
    // The matcher never falls back to a name when the email does not match,
    // so this person is a genuine invite or create candidate.
    expect(
      planImportUsers(members, [person("Grace Hopper", "other@example.com")]),
    ).toEqual([{ name: "Grace Hopper", email: "other@example.com" }]);
  });

  it("normalizes emails like the assignee matcher does", () => {
    expect(
      planImportUsers(members, [person("Ada", "ADA@example.com")]),
    ).toEqual([]);
  });
});
