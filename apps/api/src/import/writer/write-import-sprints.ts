import type { ImportedSprint } from "@kaneo/importers";
import { createId } from "@paralleldrive/cuid2";
import type db from "../../database";
import { sprintTable } from "../../database/schema";
import { parseImportDate } from "./plan-import-tasks";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Creates the project's sprints. Only one sprint may be active per project;
 * if the source claims more, later ones are stored as future sprints.
 */
export async function writeImportSprints(
  tx: Transaction,
  projectId: string,
  sprints: readonly ImportedSprint[],
): Promise<Map<string, string>> {
  const byKey = new Map<string, string>();
  if (sprints.length === 0) return byKey;

  let activeAssigned = false;
  const usedNames = new Set<string>();
  const rows = sprints.map((sprint, position) => {
    const id = createId();
    byKey.set(sprint.key, id);
    let status: ImportedSprint["state"];
    if (sprint.state === "active" && !activeAssigned) {
      activeAssigned = true;
      status = "active";
    } else {
      status = sprint.state === "closed" ? "closed" : "future";
    }
    const goal = sprint.goal?.trim();
    return {
      id,
      projectId,
      // Jira allows duplicate sprint names; Kaneo's project does not.
      name: uniqueSprintName(
        sprint.name.trim() || `Sprint ${position + 1}`,
        usedNames,
      ),
      goal: goal || null,
      status,
      startDate: parseImportDate(sprint.startDate),
      endDate: parseImportDate(sprint.endDate),
      position,
      createdAt: new Date(),
    };
  });

  await tx.insert(sprintTable).values(rows);
  return byKey;
}

function uniqueSprintName(name: string, usedNames: Set<string>): string {
  if (!usedNames.has(name)) {
    usedNames.add(name);
    return name;
  }
  let suffix = 2;
  while (usedNames.has(`${name} (${suffix})`)) suffix += 1;
  const unique = `${name} (${suffix})`;
  usedNames.add(unique);
  return unique;
}
