import { asc, eq } from "drizzle-orm";
import db from "../../database";
import { taskAttributeTable } from "../../database/schema";

async function getTaskAttributesByWorkspaceId(workspaceId: string) {
  return db
    .select()
    .from(taskAttributeTable)
    .where(eq(taskAttributeTable.workspaceId, workspaceId))
    .orderBy(asc(taskAttributeTable.position), asc(taskAttributeTable.name));
}

export default getTaskAttributesByWorkspaceId;
