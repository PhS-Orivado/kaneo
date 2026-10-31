import type { ImportedProject, ImportSourceId } from "@kaneo/importers";
import { createId } from "@paralleldrive/cuid2";
import { eq, sql } from "drizzle-orm";
import type db from "../../database";
import { projectTable } from "../../database/schema";
import type { ImportCounts, ImportStage } from "../import-run-project";
import { assignImportTaskNumbers } from "./assign-import-task-numbers";
import { loadAssignableMembers } from "./load-assignable-members";
import { createAssigneeMatcher } from "./match-assignees";
import { planImportColumns } from "./plan-import-columns";
import { planImportRelations } from "./plan-import-relations";
import { closedSprintKeys, planImportSprints } from "./plan-import-sprints";
import { planImportTasks } from "./plan-import-tasks";
import {
  planImportAttachments,
  type ImportTaskAttachments,
} from "./write-import-attachments";
import { type ImportUserHandling, planImportUsers } from "./plan-import-users";
import { writeImportColumns } from "./write-import-columns";
import { writeImportComments } from "./write-import-comments";
import { writeImportLabels } from "./write-import-labels";
import { writeImportRelations } from "./write-import-relations";
import { writeImportSprints } from "./write-import-sprints";
import { writeImportTasks } from "./write-import-tasks";
import { writeImportUsers } from "./write-import-users";

type Transaction = Parameters<Parameters<typeof db.transaction>[0][0]>;

export type ProjectContentInput = {
  projectId: string;
  workspaceId: string;
  userId: string;
  source: ImportSourceId;
  project: ImportedProject;
  includeComments: boolean;
  userHandling: ImportUserHandling;
  onStage?: (stage: ImportStage) => void;
};

export type ProjectContentResult = {
  counts: ImportCounts;
  warnings: string[];
  attachments: ImportTaskAttachments[];
};

export async function writeProjectContent(
  tx: Transaction,
  {
    projectId,
    workspaceId,
    userId,
    source,
    project,
    includeComments,
    userHandling,
    onStage,
  }: ProjectContentInput,
): Promise<ProjectContentResult> {
  const now = new Date();
  const description = project.description?.trim();
  if (description) {
    await tx
      .update(projectTable)
      .set({ description })
      .where(eq(projectTable.id, projectId));
  }

  const columnPlan = planImportColumns(project.columns);
  const board = await writeImportColumns(tx, projectId, columnPlan);
  const members = await loadAssignableMembers(tx, workspaceId, projectId);
  // A closed sprint keeps completed tasks as its history, so every task
  // imported into one lands in the final column, whatever its source status.
  const doneColumnKey = columnPlan.columns
    .filter((column) => column.isFinal)
    .at(-1)?.key;
  const doneColumn = doneColumnKey
    ? (board.byKey.get(doneColumnKey) ?? null)
    : null;

  onStage?.("sprints");
  const plannedSprints = planImportSprints(project.sprints ?? [], createId);
  const sprintIds = await writeImportSprints(tx, projectId, plannedSprints);

  onStage?.("users");
  const plannedUsers = planImportUsers(
    members,
    project.tasks.map((task) => task.assignee),
  );
  const writtenUsers =
    plannedUsers.length > 0
      ? await writeImportUsers(tx, {
          workspaceId,
          userId,
          handling: userHandling,
          users: plannedUsers,
        })
      : { members: [], users: 0, warnings: [] };

  const assignees = createAssigneeMatcher([
    ...members,
    ...writtenUsers.members,
  ]);

  const { numbers, lastNumber } = assignImportTaskNumbers(project.tasks);
  if (lastNumber > 0) {
    await tx
      .update(projectTable)
      .set({
        lastTaskNumber: sql`GREATEST(${projectTable.lastTaskNumber}, ${lastNumber})`,
      })
      .where(eq(projectTable.id, projectId));
  }

  onStage?.("tasks");
  const tasks = planImportTasks({
    tasks: project.tasks,
    columns: board.byKey,
    fallbackColumn: board.fallback,
    numbers,
    now,
    newId: createId,
    assign: assignees.match,
    sprints: sprintIds,
    closedSprints: closedSprintKeys(project.sprints ?? []),
    doneColumn,
  });
  await writeImportTasks(tx, projectId, userId, tasks);

  const labels = await writeImportLabels(
    tx,
    workspaceId,
    project.labels,
    tasks,
  );

  const comments = includeComments
    ? await writeImportComments(tx, {
        tasks,
        importedBy: userId,
        source,
        now,
      })
    : 0;

  const relations = await writeImportRelations(
    tx,
    planImportRelations(
      project.relations,
      new Map(tasks.map((task) => [task.key, task.id])),
    ),
  );

  const unmatched = assignees.warning();
  return {
    counts: {
      columns: board.count,
      tasks: tasks.length,
      labels,
      comments,
      assignees: tasks.filter((task) => task.userId).length,
      relations,
      attachments: 0,
      sprints: plannedSprints.length,
      users: writtenUsers.users,
    },
    warnings: [
      ...project.warnings,
      ...columnPlan.warnings,
      ...writtenUsers.warnings,
      ...(unmatched ? [unmatched] : []),
    ],
    attachments: planImportAttachments(
      tasks.map((task) => ({
        key: task.key,
        id: task.id,
        description: task.description,
      })),
      project.tasks,
    ),
  };
}
