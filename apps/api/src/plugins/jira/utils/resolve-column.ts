import { and, asc, eq, isNull } from "drizzle-orm";
import db from "../../../database";
import { columnTable, workflowRuleTable } from "../../../database/schema";

// Status resolution mirrors the Gitea plugin: the binding-specific rule wins
// over the type-wide rule (integration_id NULL). Jira additionally accepts an
// optional status name so a `jira_status:<name>` rule can map individual Jira
// statuses onto specific columns.
export async function resolveTargetStatus(
  projectId: string,
  eventType: string,
  fallbackStatus: string,
  database: Pick<typeof db, "select" | "query"> = db,
  integrationId?: string | null,
  jiraStatusName?: string,
): Promise<string> {
  const projectColumns = await database
    .select({
      id: columnTable.id,
      slug: columnTable.slug,
    })
    .from(columnTable)
    .where(eq(columnTable.projectId, projectId))
    .orderBy(asc(columnTable.position));

  if (projectColumns.length === 0) {
    return fallbackStatus;
  }

  const findRule = async (event: string, specific: boolean) =>
    database.query.workflowRuleTable.findFirst({
      where: and(
        eq(workflowRuleTable.projectId, projectId),
        eq(workflowRuleTable.integrationType, "jira"),
        eq(workflowRuleTable.eventType, event),
        specific
          ? eq(workflowRuleTable.integrationId, integrationId ?? "")
          : isNull(workflowRuleTable.integrationId),
      ),
    });

  const rules = [];
  if (jiraStatusName) {
    rules.push(await findRule(`jira_status:${jiraStatusName}`, true));
    rules.push(await findRule(`jira_status:${jiraStatusName}`, false));
  }
  rules.push(await findRule(eventType, true));
  rules.push(await findRule(eventType, false));

  for (const rule of rules) {
    if (!rule) continue;
    const mappedColumn = projectColumns.find(
      (column) => column.id === rule.columnId,
    );
    if (mappedColumn) {
      return mappedColumn.slug;
    }
  }

  const fallbackColumn = projectColumns.find(
    (column) => column.slug === fallbackStatus,
  );
  if (fallbackColumn) {
    return fallbackColumn.slug;
  }

  return projectColumns[0]?.slug ?? fallbackStatus;
}
