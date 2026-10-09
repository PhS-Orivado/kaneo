import { acceptsIssue } from "../../plugins/sync/rules";
import { canSyncTask } from "../../plugins/sync/eligibility";
import { sameConfig } from "../../plugins/sync/same-config";
import { and, eq, or } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import {
  activityTable,
  columnTable,
  externalLinkTable,
  integrationTable,
  projectTable,
  taskAttributeTable,
  taskRelationTable,
  taskTable,
  userTable,
  workspaceUserTable,
} from "../../database/schema";
import { publishEvent } from "../../events";
import type { JiraConfig } from "../../plugins/jira/config";
import { isKaneoComment } from "../../plugins/jira/utils/comment-origin";
import {
  createJiraClient,
  type JiraComment,
  type JiraIssue,
  type JiraIssueLink,
  type JiraUser,
} from "../../plugins/jira/utils/jira-api";
import {
  jiraCommentUrl,
  jiraIssueBrowseUrl,
  formatTaskDescriptionFromJira,
} from "../../plugins/jira/utils/format";
import { kaneoPriorityForJiraName } from "../../plugins/jira/utils/priority";
import { resolveTargetStatus } from "../../plugins/jira/utils/resolve-column";
import {
  createExternalLink,
  findExternalLink,
} from "../../plugins/github/services/link-manager";
import { extractIssuePriority } from "../../plugins/github/utils/extract-priority";
import { claimTaskNumber } from "../../task/controllers/claim-task-numbers";
import {
  TASK_ATTRIBUTE_COLORS,
  TASK_ATTRIBUTE_DESCRIPTION_MAX_LENGTH,
  TASK_ATTRIBUTE_NAME_MAX_LENGTH,
} from "../../task-attribute/attribute-validation";

import {
  type IntegrationDatabase,
  linkedTaskScope,
  withIntegrationTask,
} from "../../plugins/github/services/integration-task-scope";
import { syncJiraLabelsToTask } from "../../plugins/jira/services/labels";
import createWorkspaceInvitations from "../../workspace/controllers/create-workspace-invitations";

type IssueImportStatus = "imported" | "updated" | "skipped";

type ImportResult = {
  imported: number;
  updated: number;
  skipped: number;
  relations: number;
  users: {
    invited: number;
    members: number;
    withoutEmail: string[];
  };
  errors?: string[];
};

type PlannedRelation = {
  relationType: "subtask" | "blocks" | "related";
  sourceKey: string;
  targetKey: string;
};

// Jira users are keyed by email when they expose one: only an email can be
// invited, and only an email can be matched onto a member. Identity-keyed
// entries without an email are reported so the admin can invite them by hand.
type CollectedUsers = {
  byEmail: Map<string, string>;
  withoutEmail: Map<string, string>;
};

// Imports are keyed by integration id, so every binding keeps its own issue
// links. When a projectId is also provided (compat with the old
// project-keyed body), it must match the binding's project; a mismatch is a
// 404, never a 403, so the endpoint does not confirm the existence of a
// foreign binding. Refreshes never touch task status: statuses flow inbound
// through webhook transitions, so an import can never fight the workflow.
// The import is one-way: task.created carries an empty syncIntegrationIds, so
// no repository binding creates an issue for the imported tasks either.
export async function importJiraIssues({
  integrationId,
  projectId: expectedProjectId,
  actorId,
}: {
  integrationId: string;
  projectId?: string;
  actorId: string;
}): Promise<ImportResult> {
  const errors: string[] = [];
  let imported = 0;
  let updated = 0;
  let skipped = 0;

  const integration = await db.query.integrationTable.findFirst({
    where: and(
      eq(integrationTable.id, integrationId),
      eq(integrationTable.type, "jira"),
    ),
  });

  if (!integration) {
    throw new HTTPException(404, { message: "Jira integration not found" });
  }

  const projectId = integration.projectId;
  if (expectedProjectId && expectedProjectId !== projectId) {
    throw new HTTPException(404, { message: "Jira integration not found" });
  }

  const project = await db.query.projectTable.findFirst({
    where: eq(projectTable.id, projectId),
  });

  if (!project) {
    throw new HTTPException(404, { message: "Project not found" });
  }

  if (!integration.isActive) {
    throw new HTTPException(400, {
      message: "Jira integration is not active",
    });
  }

  let config: JiraConfig;
  try {
    config = JSON.parse(integration.config) as JiraConfig;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn("Invalid Jira integration config JSON", {
      integrationId: integration.id,
      error,
    });
    throw new HTTPException(400, {
      message: `Invalid Jira integration config: ${message}`,
    });
  }

  if (!config.apiToken || !config.baseUrl || !config.projectKey) {
    throw new HTTPException(400, {
      message: "Jira token, base URL, or project key not configured",
    });
  }

  const client = createJiraClient(config);

  // Members are matched by email: that is the only identity Kaneo shares with
  // Jira, and only existing members can be assigned to a task.
  const membersByEmail = new Map<string, string>();
  const workspaceMembers = await db
    .select({ userId: workspaceUserTable.userId, email: userTable.email })
    .from(workspaceUserTable)
    .innerJoin(userTable, eq(userTable.id, workspaceUserTable.userId))
    .where(eq(workspaceUserTable.workspaceId, project.workspaceId));
  for (const member of workspaceMembers) {
    membersByEmail.set(member.email.trim().toLowerCase(), member.userId);
  }

  const epicLinkFieldId = await findEpicLinkFieldId(client);

  const allIssues: JiraIssue[] = [];

  // The listing runs outside the per-issue try/catch, so a Jira failure here
  // used to escape as a bare 500. It becomes a 502 carrying the upstream
  // message, so the caller can see what Jira actually said.
  try {
    allIssues.push(
      ...(await client.searchIssues(config.projectKey, epicLinkFieldId ?? "")),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new HTTPException(502, {
      message: `Jira request failed while listing issues: ${message}`,
    });
  }

  const users: CollectedUsers = { byEmail: new Map(), withoutEmail: new Map() };
  const taskIdsByKey = new Map<string, string>();

  const attributeByIssueType = await resolveIssueTypeAttributes(
    project.workspaceId,
    allIssues.map((issue) => issue.fields.issuetype?.name),
    config,
  );

  for (const issue of allIssues) {
    collectIssueUsers(users, issue);

    try {
      const result = await importSingleIssue({
        issue,
        integrationId,
        projectId,
        workspaceId: project.workspaceId,
        config,
        client,
        users,
        membersByEmail,
        attributeByIssueType,
      });

      if (result.taskId) taskIdsByKey.set(issue.key, result.taskId);

      if (result.status === "imported") {
        imported++;
      } else if (result.status === "updated") {
        updated++;
      } else {
        skipped++;
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      errors.push(`Issue ${issue.key}: ${errorMessage}`);
    }
  }

  const relations = await importRelations({
    allIssues,
    taskIdsByKey,
    epicLinkFieldId,
    projectId,
    actorId,
    errors,
  });

  const { invited, members } = await inviteJiraUsers({
    workspaceId: project.workspaceId,
    actorId,
    users,
    errors,
  });

  return {
    imported,
    updated,
    skipped,
    relations,
    users: {
      invited,
      members,
      withoutEmail: [...new Set(users.withoutEmail.values())].sort(),
    },
    ...(errors.length > 0 ? { errors } : {}),
  };
}

async function importSingleIssue({
  issue,
  integrationId,
  projectId,
  workspaceId,
  config,
  client,
  users,
  membersByEmail,
  attributeByIssueType,
}: {
  issue: JiraIssue;
  integrationId: string;
  projectId: string;
  workspaceId: string;
  config: JiraConfig;
  client: ReturnType<typeof createJiraClient>;
  users: CollectedUsers;
  membersByEmail: Map<string, string>;
  attributeByIssueType: Map<string, string | null>;
}): Promise<{ status: IssueImportStatus; taskId: string | null }> {
  const existingLink = await findExternalLink(
    integrationId,
    "issue",
    issue.key,
  );

  if (!existingLink && !acceptsIssue(config, issue.fields.labels))
    return { status: "skipped", taskId: null };

  const labels = issue.fields.labels ?? [];
  const priority =
    kaneoPriorityForJiraName(issue.fields.priority?.name) ??
    extractIssuePriority(labels);

  const comments = await fetchIssueComments(issue.key, client);
  for (const comment of comments) collectJiraUser(users, comment.author);

  if (existingLink) {
    const result = await withIntegrationTask(
      existingLink.taskId,
      { id: integrationId, projectId, project: { workspaceId } },
      async (database, afterCommit) => {
        const [linked] = await database
          .select({ id: externalLinkTable.id })
          .from(externalLinkTable)
          .where(
            and(
              eq(externalLinkTable.id, existingLink.id),
              eq(externalLinkTable.taskId, existingLink.taskId),
              eq(externalLinkTable.integrationId, integrationId),
            ),
          )
          .for("update");
        if (
          !linked ||
          !(await canSyncTask(existingLink.taskId, integrationId, database))
        )
          return { status: "skipped", taskId: existingLink.taskId } as const;

        const updateData: Record<string, unknown> = {
          title: issue.fields.summary,
          description: formatTaskDescriptionFromJira(
            issue.fields.description,
            existingLink.taskId,
          ),
        };

        if (priority) updateData.priority = priority;

        // Refreshes only fill values Jira still carries: an assignee or date
        // removed in Jira never blanks a value set by hand in Kaneo.
        const assigneeId = resolveAssignee(
          issue.fields.assignee,
          membersByEmail,
        );
        if (assigneeId) updateData.userId = assigneeId;
        const { startDate, dueDate } = toDateRange(issue.fields);
        if (startDate) updateData.startDate = startDate;
        if (dueDate) updateData.dueDate = dueDate;

        await database
          .update(taskTable)
          .set(updateData)
          .where(linkedTaskScope(existingLink.taskId, projectId));

        await syncJiraLabelsToTask(
          existingLink.taskId,
          workspaceId,
          labels,
          database,
        );

        await importCommentsForTask(
          comments,
          issue.key,
          config,
          existingLink.taskId,
          database,
        );

        afterCommit(async () => {
          for (const type of [
            "task.updated",
            "task.labels_updated",
            "comment.updated",
          ])
            await publishEvent(type, {
              projectId,
              taskId: existingLink.taskId,
            });
        });
        return {
          status: "updated",
          taskId: existingLink.taskId,
        } as const;
      },
    );
    return result ?? { status: "skipped", taskId: existingLink.taskId };
  }

  const closed = issue.fields.status?.statusCategory?.key === "done";

  const createdTask = await withIntegrationTask(
    null,
    { id: integrationId, projectId, project: { workspaceId } },
    async (tx) => {
      const binding = await tx.query.integrationTable.findFirst({
        where: eq(integrationTable.id, integrationId),
      });
      if (
        !binding ||
        !sameConfig(binding.config, JSON.stringify(config)) ||
        !acceptsIssue(binding.config, issue.fields.labels) ||
        (await findExternalLink(integrationId, "issue", issue.key, tx))
      )
        return null;

      const resolvedStatus = await resolveTargetStatus(
        projectId,
        closed ? "issue_closed" : "issue_opened",
        closed ? "done" : "to-do",
        tx,
        integrationId,
        issue.fields.status?.name,
      );
      let targetColumn = await tx.query.columnTable.findFirst({
        where: and(
          eq(columnTable.projectId, projectId),
          eq(columnTable.slug, resolvedStatus),
        ),
      });
      if (closed && !targetColumn?.isFinal)
        targetColumn = await tx.query.columnTable.findFirst({
          where: and(
            eq(columnTable.projectId, projectId),
            eq(columnTable.isFinal, true),
          ),
          orderBy: (column, { asc }) => [asc(column.position)],
        });

      const nextNumber = await claimTaskNumber(projectId, tx);
      const { startDate, dueDate } = toDateRange(issue.fields);

      // RFC 0002: the issue type maps onto a workspace task attribute; the
      // resolver already applied the create-missing and default fallbacks.
      const issueTypeKey = (issue.fields.issuetype?.name ?? "")
        .trim()
        .toLowerCase();
      const attributeId = issueTypeKey
        ? (attributeByIssueType.get(issueTypeKey) ?? null)
        : (attributeByIssueType.get("") ?? null);

      const taskValues: typeof taskTable.$inferInsert = {
        projectId,
        userId: resolveAssignee(issue.fields.assignee, membersByEmail),
        title: issue.fields.summary,
        description: formatTaskDescriptionFromJira(
          issue.fields.description,
          undefined,
        ),
        status: closed ? (targetColumn?.slug ?? "done") : resolvedStatus,
        columnId: targetColumn?.id ?? null,
        priority: priority ?? "low",
        attributeId,
        number: nextNumber,
        ...(startDate ? { startDate } : {}),
        ...(dueDate ? { dueDate } : {}),
      };

      const [created] = await tx
        .insert(taskTable)
        .values(taskValues)
        .returning();

      if (!created) {
        throw new Error("Failed to create task");
      }

      await createExternalLink(
        {
          taskId: created.id,
          integrationId,
          resourceType: "issue",
          externalId: issue.key,
          url: jiraIssueBrowseUrl(config.baseUrl, issue.key),
          title: issue.fields.summary,
          metadata: {
            state: closed ? "closed" : "open",
            createdFrom: "jira-import",
            author:
              issue.fields.creator?.displayName ?? issue.fields.creator?.name,
          },
        },
        tx,
      );

      await syncJiraLabelsToTask(created.id, workspaceId, labels, tx);
      await canSyncTask(created.id, integrationId, tx, binding.config);

      await importCommentsForTask(comments, issue.key, config, created.id, tx);

      return created;
    },
  );
  if (!createdTask) return { status: "skipped", taskId: null };

  await publishEvent("task.created", {
    ...createdTask,
    taskId: createdTask.id,
    userId: createdTask.userId ?? "",
    type: "task",
    content: null,
    source: "jira-import",
    integrationId,
    externalId: issue.key,
    // One-way import: an empty selection means no repository binding may
    // create an issue for this task.
    syncIntegrationIds: [],
  });

  return { status: "imported", taskId: createdTask.id };
}

// Relations run after every task exists: parent and epic references resolve
// only when both sides are tasks. Cross-project references whose other side
// was not imported are skipped silently, like the CLI does.
async function importRelations({
  allIssues,
  taskIdsByKey,
  epicLinkFieldId,
  projectId,
  actorId,
  errors,
}: {
  allIssues: JiraIssue[];
  taskIdsByKey: Map<string, string>;
  epicLinkFieldId: string | null;
  projectId: string;
  actorId: string;
  errors: string[];
}): Promise<number> {
  const seen = new Set<string>();
  let relations = 0;

  for (const issue of allIssues) {
    const planned: PlannedRelation[] = [];

    // Company-managed subtasks point at their parent.
    const parentKey = issue.fields.parent?.key;
    if (parentKey && parentKey !== issue.key) {
      planned.push({
        relationType: "subtask",
        sourceKey: parentKey,
        targetKey: issue.key,
      });
    }

    // Team-managed epics link through a custom field resolved by name.
    if (epicLinkFieldId) {
      const epicKey = (issue.fields as Record<string, unknown>)[
        epicLinkFieldId
      ];
      if (typeof epicKey === "string" && epicKey && epicKey !== issue.key) {
        planned.push({
          relationType: "subtask",
          sourceKey: epicKey,
          targetKey: issue.key,
        });
      }
    }

    // Classic subtask issues appear in their parent's subtasks list.
    for (const subtask of issue.fields.subtasks ?? []) {
      const subtaskKey = subtask?.key;
      if (subtaskKey && subtaskKey !== issue.key) {
        planned.push({
          relationType: "subtask",
          sourceKey: issue.key,
          targetKey: subtaskKey,
        });
      }
    }

    for (const link of issue.fields.issuelinks ?? []) {
      const relation = relationForLink(issue, link);
      if (relation) planned.push(relation);
    }

    for (const relation of planned) {
      const canonical = `${relation.relationType}|${relation.sourceKey}|${relation.targetKey}`;
      if (seen.has(canonical)) continue;
      seen.add(canonical);

      const sourceTaskId = taskIdsByKey.get(relation.sourceKey);
      const targetTaskId = taskIdsByKey.get(relation.targetKey);
      if (!sourceTaskId || !targetTaskId || sourceTaskId === targetTaskId)
        continue;

      try {
        const created = await insertTaskRelation(
          sourceTaskId,
          targetTaskId,
          relation.relationType,
        );
        if (!created) continue;
        relations++;

        await publishEvent("task-relation.created", {
          sourceTaskId,
          targetTaskId,
          relationType: relation.relationType,
          taskId: sourceTaskId,
          projectId,
          userId: actorId,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(
          `Relation ${relation.sourceKey} -> ${relation.targetKey}: ${message}`,
        );
      }
    }
  }

  return relations;
}

// Relations are inserted directly: the HTTP controller's authorization and
// project-access checks do not apply to rows between tasks the import itself
// created, and the table has no unique constraint, so a pre-check mirrors the
// controller's duplicate guard (both directions).
async function insertTaskRelation(
  sourceTaskId: string,
  targetTaskId: string,
  relationType: string,
): Promise<boolean> {
  const existing = await db
    .select({ id: taskRelationTable.id })
    .from(taskRelationTable)
    .where(
      and(
        eq(taskRelationTable.relationType, relationType),
        or(
          and(
            eq(taskRelationTable.sourceTaskId, sourceTaskId),
            eq(taskRelationTable.targetTaskId, targetTaskId),
          ),
          and(
            eq(taskRelationTable.sourceTaskId, targetTaskId),
            eq(taskRelationTable.targetTaskId, sourceTaskId),
          ),
        ),
      ),
    )
    .limit(1);

  if (existing.length > 0) return false;

  await db
    .insert(taskRelationTable)
    .values({ sourceTaskId, targetTaskId, relationType });

  return true;
}

// Maps an issue link to a Kaneo relation with the blocked-by direction
// normalized: whoever blocks, blocks. Everything else Jira offers (relates,
// duplicates, causes, clones, ...) stays a Kaneo "related" relation.
function relationForLink(
  issue: JiraIssue,
  link: JiraIssueLink,
): PlannedRelation | null {
  const linkName = (link.type?.name ?? "").trim().toLowerCase();
  const inwardKey = link.inwardIssue?.key;
  const outwardKey = link.outwardIssue?.key;

  if (linkName === "blocks" || linkName.includes("block")) {
    if (outwardKey) {
      return {
        relationType: "blocks",
        sourceKey: issue.key,
        targetKey: outwardKey,
      };
    }
    if (inwardKey) {
      return {
        relationType: "blocks",
        sourceKey: inwardKey,
        targetKey: issue.key,
      };
    }
    return null;
  }

  const otherKey = outwardKey ?? inwardKey;
  if (!otherKey || otherKey === issue.key) return null;

  return { relationType: "related", sourceKey: issue.key, targetKey: otherKey };
}

// Jira users who are not workspace members yet receive a pending invitation
// without an email; the admin picks who receives the link from the workspace
// settings. Failures never fail the import: the tasks are already created.
async function inviteJiraUsers({
  workspaceId,
  actorId,
  users,
  errors,
}: {
  workspaceId: string;
  actorId: string;
  users: CollectedUsers;
  errors: string[];
}): Promise<{ invited: number; members: number }> {
  const emails = [...users.byEmail.keys()];
  if (emails.length === 0) return { invited: 0, members: 0 };

  try {
    const { invitations } = await createWorkspaceInvitations({
      workspaceId,
      actorId,
      role: "member",
      invitations: emails.map((email) => ({ email, sendEmail: false })),
    });

    let invited = 0;
    let members = 0;
    for (const invitation of invitations) {
      if (
        invitation.status === "created" ||
        invitation.status === "already_invited"
      ) {
        invited++;
      } else if (invitation.status === "already_member") {
        members++;
      } else if (invitation.error) {
        errors.push(`Invitation for ${invitation.email}: ${invitation.error}`);
      }
    }
    return { invited, members };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push(`Workspace invitations failed: ${message}`);
    return { invited: 0, members: 0 };
  }
}

// Company-managed epics reference the epic through a custom field whose id
// differs per instance; /field exposes it by name. Any failure (restricted
// endpoint, Data Center without the field) just drops epic links: parent and
// subtask fields still carry the hierarchy.
async function findEpicLinkFieldId(
  client: ReturnType<typeof createJiraClient>,
): Promise<string | null> {
  try {
    const fields = await client.listFields();
    return (
      fields.find(
        (field) => field.name?.trim().toLowerCase() === "epic link",
      )?.id ?? null
    );
  } catch (error) {
    console.warn("Could not resolve the Jira Epic Link field", error);
    return null;
  }
}

// Jira assignees only map onto Kaneo members sharing the same email; other
// users keep the task unassigned until they are invited and matched.
function resolveAssignee(
  assignee: JiraUser | null | undefined,
  membersByEmail: Map<string, string>,
): string | null {
  const email = assignee?.emailAddress?.trim().toLowerCase();
  if (!email) return null;
  return membersByEmail.get(email) ?? null;
}

// RFC 0002: Jira issue types map onto workspace task attributes by
// case-insensitive name. With createMissingTaskAttributes enabled, unknown
// issue types become new workspace attributes so imported tasks keep their
// type; otherwise they fall back to the workspace default attribute. The
// empty key carries that fallback for issues without an issue type name.
async function resolveIssueTypeAttributes(
  workspaceId: string,
  issueTypeNames: (string | undefined)[],
  config: JiraConfig,
): Promise<Map<string, string | null>> {
  const names = [
    ...new Set(
      issueTypeNames
        .map((name) => name?.trim())
        .filter((name): name is string => Boolean(name)),
    ),
  ];

  const attributes = await db
    .select({
      id: taskAttributeTable.id,
      name: taskAttributeTable.name,
      position: taskAttributeTable.position,
      isDefault: taskAttributeTable.isDefault,
    })
    .from(taskAttributeTable)
    .where(eq(taskAttributeTable.workspaceId, workspaceId));

  const idByName = new Map(
    attributes.map((attribute) => [
      attribute.name.trim().toLowerCase(),
      attribute.id,
    ]),
  );
  const defaultAttributeId =
    attributes.find((attribute) => attribute.isDefault)?.id ?? null;

  const missing = config.createMissingTaskAttributes
    ? names.filter((name) => !idByName.has(name.toLowerCase()))
    : [];
  let nextPosition =
    attributes.reduce(
      (max, attribute) => Math.max(max, attribute.position),
      -1,
    ) + 1;

  for (const name of missing) {
    // The unique index is on lower(name), so a case-insensitive match was
    // already checked; a bare conflict target still covers concurrent imports.
    const color =
      TASK_ATTRIBUTE_COLORS[nextPosition % TASK_ATTRIBUTE_COLORS.length];
    const [created] = await db
      .insert(taskAttributeTable)
      .values({
        workspaceId,
        name: name.slice(0, TASK_ATTRIBUTE_NAME_MAX_LENGTH),
        description: `Created by the Jira import for issue type ${name}`.slice(
          0,
          TASK_ATTRIBUTE_DESCRIPTION_MAX_LENGTH,
        ),
        icon: "SquareCheckBig",
        iconColor: color,
        textColor: color,
        position: nextPosition,
        isDefault: false,
      })
      .onConflictDoNothing()
      .returning({ id: taskAttributeTable.id });
    if (created) {
      idByName.set(name.toLowerCase(), created.id);
    }
    nextPosition += 1;
  }

  const resolved = new Map<string, string | null>();
  resolved.set("", defaultAttributeId);
  for (const name of names) {
    resolved.set(
      name.toLowerCase(),
      idByName.get(name.toLowerCase()) ?? defaultAttributeId,
    );
  }
  return resolved;
}

// Kaneo validates startDate <= dueDate; Jira issues can be overdue, so the
// created timestamp only becomes the start date when it fits before the due
// date.
function toDateRange(fields: JiraIssue["fields"]): {
  startDate?: Date;
  dueDate?: Date;
} {
  const created = toUtc(fields.created);
  const due = fields.duedate ? toUtc(`${fields.duedate}T23:59:59Z`) : undefined;

  if (created && due && created <= due) {
    return { startDate: created, dueDate: due };
  }
  return due ? { dueDate: due } : {};
}

function toUtc(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function collectIssueUsers(users: CollectedUsers, issue: JiraIssue): void {
  collectJiraUser(users, issue.fields.assignee);
  collectJiraUser(users, issue.fields.reporter);
  collectJiraUser(users, issue.fields.creator);
}

function collectJiraUser(
  users: CollectedUsers,
  user: JiraUser | null | undefined,
): void {
  if (!user) return;

  const displayName =
    user.displayName?.trim() || user.name?.trim() || "Unknown user";
  const email = user.emailAddress?.trim().toLowerCase();

  if (email) {
    users.byEmail.set(email, displayName);
    // The same person can appear with and without an email depending on the
    // payload; once an email is seen the identity entry is obsolete.
    for (const [identity, name] of users.withoutEmail) {
      if (name === displayName) users.withoutEmail.delete(identity);
    }
    return;
  }

  const identity = user.accountId ?? user.key ?? displayName;
  if (!identity) return;
  users.withoutEmail.set(identity, displayName);
}

async function fetchIssueComments(
  issueKey: string,
  client: ReturnType<typeof createJiraClient>,
): Promise<JiraComment[]> {
  const allComments: JiraComment[] = [];
  let startAt = 0;

  while (true) {
    const { comments, total } = await client.listComments(
      issueKey,
      startAt,
      100,
    );

    if (comments.length === 0) break;

    allComments.push(...comments);

    startAt += comments.length;
    if (startAt >= total) break;
  }

  return allComments;
}

async function importCommentsForTask(
  allComments: JiraComment[],
  issueKey: string,
  config: JiraConfig,
  taskId: string,
  database: IntegrationDatabase,
): Promise<void> {
  for (const comment of allComments) {
    // Comments authored by Kaneo's own token are outbound echoes.
    if (isKaneoComment(comment.body)) continue;
    if (
      config.selfAccountId &&
      comment.author?.accountId &&
      comment.author.accountId === config.selfAccountId
    ) {
      continue;
    }

    const username =
      comment.author?.displayName ?? comment.author?.name ?? "Unknown";

    // Keep the Jira timestamp so the comment history reads chronologically.
    const createdAt = comment.created
      ? new Date(comment.created)
      : undefined;

    await database
      .insert(activityTable)
      .values({
        taskId,
        type: "comment",
        ...(createdAt && !Number.isNaN(createdAt.getTime())
          ? { createdAt }
          : {}),
        content: comment.body,
        externalUserName: username || "Unknown",
        externalSource: "jira",
        externalUrl: jiraCommentUrl(config.baseUrl, issueKey, comment.id),
        eventData: {
          externalCommentId: comment.id,
        },
      })
      .onConflictDoNothing({
        target: [
          activityTable.taskId,
          activityTable.externalSource,
          activityTable.externalUrl,
        ],
      });
  }
}
