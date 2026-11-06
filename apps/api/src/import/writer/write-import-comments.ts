import type { ImportedComment, ImportSourceId } from "@kaneo/importers";
import { createId } from "@paralleldrive/cuid2";
import type db from "../../database";
import { activityTable } from "../../database/schema";
import { chunk } from "./chunk";
import { parseImportDate } from "./plan-import-tasks";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

type TaskComments = { id: string; comments: readonly ImportedComment[] };

const MAX_EXTERNAL_NAME_LENGTH = 120;

export type WrittenImportComments = {
  count: number;
  /** Maps each comment's source id to the activity it was written as. */
  references: Array<{ sourceKey: string; activityId: string }>;
};

export async function writeImportComments(
  tx: Transaction,
  {
    tasks,
    importedBy,
    source,
    now,
  }: {
    tasks: readonly TaskComments[];
    importedBy: string;
    source: ImportSourceId;
    now: Date;
  },
): Promise<WrittenImportComments> {
  const references: WrittenImportComments["references"] = [];
  const rows = tasks.flatMap(({ id: taskId, comments }) =>
    comments
      .filter((comment) => comment.body.trim())
      .map((comment) => {
        const activityId = createId();
        if (comment.id) references.push({ sourceKey: comment.id, activityId });
        return {
          id: activityId,
          taskId,
          type: "comment",
          userId: importedBy,
          content: comment.body,
          externalUserName: (
            comment.author.name?.trim() ||
            comment.author.email?.trim() ||
            "Unknown user"
          ).slice(0, MAX_EXTERNAL_NAME_LENGTH),
          externalSource: source,
          createdAt: parseImportDate(comment.createdAt) ?? now,
        };
      }),
  );

  for (const batch of chunk(rows)) {
    await tx.insert(activityTable).values(batch);
  }

  return { count: rows.length, references };
}
