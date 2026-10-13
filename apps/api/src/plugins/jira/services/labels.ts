import { and, eq } from "drizzle-orm";
import db from "../../../database";
import { labelTable } from "../../../database/schema";
import type { IntegrationDatabase } from "../../github/services/integration-task-scope";
import { importIssueLabels } from "../../sync/issue-labels";
import { issueLabelNames } from "../../sync/rules";
import { isSystemLabelName } from "../utils/system-labels";

// Inbound label sync: the Jira issue's labels replace the task's non-system
// labels. System labels (priority:/status:) are inbound-synced through their
// own field handlers, so they never pass through here.
export async function syncJiraLabelsToTask(
  taskId: string,
  workspaceId: string,
  labels: unknown,
  database: IntegrationDatabase = db,
) {
  const names = issueLabelNames(labels).filter(
    (name) => !isSystemLabelName(name),
  );

  const existing = await database.query.labelTable.findMany({
    where: eq(labelTable.taskId, taskId),
    columns: { name: true },
  });

  for (const label of existing) {
    if (!isSystemLabelName(label.name) && !names.includes(label.name)) {
      await database
        .delete(labelTable)
        .where(
          and(eq(labelTable.taskId, taskId), eq(labelTable.name, label.name)),
        );
    }
  }

  await importIssueLabels(taskId, workspaceId, labels, database);
}
