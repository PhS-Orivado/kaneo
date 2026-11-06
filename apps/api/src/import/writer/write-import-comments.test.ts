import type { ImportedComment } from "@kaneo/importers";
import { describe, expect, it } from "vite-plus/test";
import { writeImportComments } from "./write-import-comments";

type Transaction = Parameters<typeof writeImportComments>[0];

const now = new Date("2026-10-11T12:00:00.000Z");

async function authorNames(comments: ImportedComment[]) {
  const rows: { externalUserName: string }[] = [];
  const tx = {
    insert: () => ({
      values: async (batch: typeof rows) => {
        rows.push(...batch);
      },
    }),
  } as unknown as Transaction;

  await writeImportComments(tx, {
    tasks: [{ id: "task-1", comments }],
    importedBy: "user-1",
    source: "planka",
    now,
  });

  return rows.map((row) => row.externalUserName);
}

describe("writeImportComments", () => {
  it("names the author by name, then email, then as unknown", async () => {
    await expect(
      authorNames([
        { author: { name: " Ana ", email: "ana@example.com" }, body: "One" },
        { author: { name: "  ", email: " bo@example.com " }, body: "Two" },
        { author: { email: "   " }, body: "Three" },
        { author: {}, body: "Four" },
      ]),
    ).resolves.toEqual([
      "Ana",
      "bo@example.com",
      "Unknown user",
      "Unknown user",
    ]);
  });

  it("keeps author names within the stored length", async () => {
    const [name] = await authorNames([
      { author: { email: `${"a".repeat(200)}@example.com` }, body: "Long" },
    ]);

    expect(name).toHaveLength(120);
  });

  it("returns the activity id for each comment that has a source id", async () => {
    const rows: { id: string; content: string }[] = [];
    const tx = {
      insert: () => ({
        values: async (batch: { id: string; content: string }[]) => {
          rows.push(...batch);
        },
      }),
    } as unknown as Transaction;

    const result = await writeImportComments(tx, {
      tasks: [
        {
          id: "task-1",
          comments: [
            { id: "c1", author: { name: "Ada" }, body: "One" },
            { author: { name: "Bo" }, body: "Two" },
          ],
        },
      ],
      importedBy: "user-1",
      source: "jira",
      now,
    });

    expect(result.count).toBe(2);
    expect(result.references).toEqual([
      { sourceKey: "c1", activityId: rows[0]?.id },
    ]);
  });
});
