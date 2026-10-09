import { adfToMarkdown, type MediaRef } from "./adf.js";
import {
  appendSections,
  buildAppendix,
  type AppendixEntry,
} from "./appendix.js";
import { labelColorFor } from "./colors.js";
import type { KaneoClient } from "./kaneo.js";
import {
  type CustomFieldSummary,
  findFieldIdByName,
  planCustomFields,
} from "./custom-fields.js";
import type {
  JiraAttachment,
  JiraClient,
  JiraComment,
  JiraFieldMetadata,
  JiraIssue,
  JiraUser,
  JiraWorklog,
} from "./jira.js";
import { toProjectKey, uniqueKey } from "./keys.js";
import {
  displayName,
  labelsForIssue,
  planStatusColumns,
  relationForLink,
  sprintForIssue,
  toDateRange,
  toPriority,
  toTitle,
  worklogTimes,
} from "./mapping.js";

// Matches Kaneo's default upload cap (apps/api/src/storage/s3.ts). Larger
// files stay in Jira: they are listed in the task appendix and counted in
// the report, never silently dropped.
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export type JiraProjectTarget = { key: string; name: string };

export type ProjectReport = {
  project: string;
  projectName: string;
  projectKey: string | null;
  kaneoProjectId: string | null;
  columns: number;
  tasks: number;
  comments: number;
  labels: number;
  relations: number;
  worklogs: number;
  customFields: number;
  attachments: {
    source: number;
    uploaded: number;
    skipped: number;
    failed: number;
  };
  skippedIssues: number;
  warnings: string[];
  // Jira issue key to Kaneo task ID, so a re-run can continue where this one
  // stopped and so relations can resolve already-imported issues.
  taskIds: Record<string, string>;
  sourceCounts: {
    issues: number;
    comments: number;
    attachments: number;
    worklogs: number;
    links: number;
  };
  failed: boolean;
  error?: string;
};

export type MigrateOptions = {
  jira: JiraClient;
  kaneo: KaneoClient;
  workspaceId: string;
  targets: JiraProjectTarget[];
  // Filter clauses from buildJql, without the project clause.
  filterJql: string;
  dryRun: boolean;
  skipComments: boolean;
  skipAttachments: boolean;
  projectIcon?: string;
  importedTasks?: Record<string, string>;
  // Filled with every Jira user seen during the run, so the CLI can offer
  // workspace invitations. Populated in dry runs too.
  jiraUsers?: Map<string, JiraUser>;
  onProgress?: (message: string) => void;
};

export async function migrate(
  options: MigrateOptions,
): Promise<ProjectReport[]> {
  const {
    jira,
    kaneo,
    workspaceId,
    targets,
    filterJql,
    dryRun,
    skipComments,
    skipAttachments,
    projectIcon = "Layout",
    importedTasks = {},
    jiraUsers = new Map<string, JiraUser>(),
    onProgress = () => {},
  } = options;

  const takenSlugs = new Set<string>();
  const membersByEmail = new Map<string, string>();
  const fieldMetadata = await jira.listFields();

  if (!dryRun) {
    for (const project of await kaneo.listProjects(workspaceId)) {
      if (project.slug) takenSlugs.add(project.slug);
    }
    for (const member of await kaneo.listMembers(workspaceId)) {
      if (member.email)
        membersByEmail.set(member.email.toLowerCase(), member.id);
    }
  }

  const reports: ProjectReport[] = [];

  for (const target of targets) {
    const report: ProjectReport = {
      project: target.key,
      projectName: target.name,
      projectKey: null,
      kaneoProjectId: null,
      columns: 0,
      tasks: 0,
      comments: 0,
      labels: 0,
      relations: 0,
      worklogs: 0,
      customFields: 0,
      attachments: { source: 0, uploaded: 0, skipped: 0, failed: 0 },
      skippedIssues: 0,
      warnings: [],
      taskIds: {},
      sourceCounts: {
        issues: 0,
        comments: 0,
        attachments: 0,
        worklogs: 0,
        links: 0,
      },
      failed: false,
    };

    try {
      await migrateProject({
        jira,
        kaneo,
        workspaceId,
        target,
        filterJql,
        dryRun,
        skipComments,
        skipAttachments,
        projectIcon,
        takenSlugs,
        membersByEmail,
        fieldMetadata,
        importedTasks,
        jiraUsers,
        report,
        onProgress,
      });
    } catch (error) {
      report.failed = true;
      report.error = error instanceof Error ? error.message : String(error);
    }

    reports.push(report);
  }

  return reports;
}

async function migrateProject(context: {
  jira: JiraClient;
  kaneo: KaneoClient;
  workspaceId: string;
  target: JiraProjectTarget;
  filterJql: string;
  dryRun: boolean;
  skipComments: boolean;
  skipAttachments: boolean;
  projectIcon: string;
  takenSlugs: Set<string>;
  membersByEmail: Map<string, string>;
  fieldMetadata: JiraFieldMetadata[];
  importedTasks: Record<string, string>;
  jiraUsers: Map<string, JiraUser>;
  report: ProjectReport;
  onProgress: (message: string) => void;
}): Promise<void> {
  const {
    jira,
    kaneo,
    workspaceId,
    target,
    filterJql,
    dryRun,
    skipComments,
    skipAttachments,
    projectIcon,
    takenSlugs,
    membersByEmail,
    fieldMetadata,
    importedTasks,
    jiraUsers,
    report,
    onProgress,
  } = context;

  const jql = filterJql
    ? `project = "${target.key}" AND ${filterJql}`
    : `project = "${target.key}"`;

  onProgress(`Searching issues in ${target.key} (${target.name})`);
  const issues = await jira.searchIssues(jql, onProgress);

  const commentsByKey = new Map<string, JiraComment[]>();
  const worklogsByKey = new Map<string, JiraWorklog[]>();

  for (const issue of issues) {
    // Jira embeds only the first page of comments and worklogs in the search
    // response; fetch the remainder whenever the totals disagree.
    const embeddedComments = issue.fields.comment?.comments ?? [];
    const commentTotal = issue.fields.comment?.total ?? embeddedComments.length;
    commentsByKey.set(
      issue.key,
      commentTotal > embeddedComments.length
        ? await jira.listComments(issue.key)
        : embeddedComments,
    );

    const embeddedWorklogs = issue.fields.worklog?.worklogs ?? [];
    const worklogTotal = issue.fields.worklog?.total ?? embeddedWorklogs.length;
    worklogsByKey.set(
      issue.key,
      worklogTotal > embeddedWorklogs.length
        ? await jira.listWorklogs(issue.key)
        : embeddedWorklogs,
    );
  }

  const plan = planStatusColumns(issues);

  // Everyone the migration could invite: assignees, reporters, creators and
  // the authors of attachments, comments and worklogs. Collected before the
  // dry-run return so the plan preview can offer invitations too.
  for (const issue of issues) {
    collectJiraUser(jiraUsers, issue.fields.assignee);
    collectJiraUser(jiraUsers, issue.fields.reporter);
    collectJiraUser(jiraUsers, issue.fields.creator);
    for (const attachment of issue.fields.attachment ?? []) {
      collectJiraUser(jiraUsers, attachment.author);
    }
    for (const comment of commentsByKey.get(issue.key) ?? []) {
      collectJiraUser(jiraUsers, comment.author);
    }
    for (const worklog of worklogsByKey.get(issue.key) ?? []) {
      collectJiraUser(jiraUsers, worklog.author);
    }
  }

  report.sourceCounts = {
    issues: issues.length,
    comments: skipComments
      ? 0
      : [...commentsByKey.values()].reduce(
          (total, list) => total + list.length,
          0,
        ),
    attachments: issues.reduce(
      (total, issue) => total + (issue.fields.attachment?.length ?? 0),
      0,
    ),
    worklogs: [...worklogsByKey.values()].reduce(
      (total, list) => total + list.length,
      0,
    ),
    links: issues.reduce(
      (total, issue) =>
        total +
        (issue.fields.issuelinks?.length ?? 0) +
        (issue.fields.subtasks?.length ?? 0) +
        (issue.fields.parent ? 1 : 0),
      0,
    ),
  };

  if (issues.length === 0) {
    report.warnings.push("No issues matched the selected filters.");
    return;
  }

  report.columns = plan.columns.length;

  if (dryRun) {
    report.projectKey = toProjectKey(target.name);
    return;
  }

  const projectKey = uniqueKey(toProjectKey(target.name), takenSlugs);
  takenSlugs.add(projectKey);
  report.projectKey = projectKey;

  onProgress(`Creating project "${target.name}" (${projectKey})`);
  const project = await kaneo.createProject({
    name: target.name,
    workspaceId,
    icon: projectIcon,
    slug: projectKey,
  });
  report.kaneoProjectId = project.id;

  // Kaneo seeds four default columns on create; drop them while still empty.
  for (const existing of await kaneo.listColumns(project.id)) {
    await kaneo.deleteColumn(existing.id);
  }

  for (const column of plan.columns) {
    await kaneo.createColumn(project.id, {
      name: column.name,
      isFinal: column.isFinal,
    });
    if (column.renamedFrom) {
      report.warnings.push(
        `Status "${column.renamedFrom}" was imported as column "${column.name}" to avoid a naming conflict in Kaneo.`,
      );
    }
  }

  const customFieldPlan = planCustomFields(issues, fieldMetadata);
  const kaneoFieldByJiraId = new Map<string, { id: string }>();

  for (const planned of customFieldPlan.planned) {
    try {
      const field = await kaneo.createCustomField({
        projectId: project.id,
        name: planned.name,
        type: planned.type,
        ...(planned.options ? { options: planned.options } : {}),
      });
      kaneoFieldByJiraId.set(planned.jiraId, { id: field.id });
      report.customFields++;
    } catch (error) {
      report.warnings.push(
        `Custom field "${planned.name}" could not be created; its values were moved to the task appendix. (${
          error instanceof Error ? error.message : String(error)
        })`,
      );
      for (const issue of issues) {
        const value = planned.values.get(issue.key);
        if (value != null) {
          customFieldPlan.unmapped.push({
            issueKey: issue.key,
            name: planned.name,
            value,
          });
        }
      }
    }
  }

  const createdLabelNames = new Set<string>();
  const epicLinkFieldId = findFieldIdByName(fieldMetadata, "Epic Link");

  let issueIndex = 0;
  for (const issue of issues) {
    issueIndex++;
    onProgress(
      `Importing issue ${issueIndex}/${issues.length} of ${target.key}: ${issue.key}`,
    );

    const alreadyImportedId = importedTasks[issue.key];
    if (alreadyImportedId) {
      report.taskIds[issue.key] = alreadyImportedId;
      report.skippedIssues++;
      continue;
    }

    await importIssue({
      jira,
      kaneo,
      workspaceId,
      projectId: project.id,
      issue,
      comments: commentsByKey.get(issue.key) ?? [],
      worklogs: worklogsByKey.get(issue.key) ?? [],
      plan,
      membersByEmail,
      customField: { kaneoFieldByJiraId, plan: customFieldPlan },
      epicLinkFieldId,
      skipComments,
      skipAttachments,
      createdLabelNames,
      report,
      onProgress,
    });
  }

  if (report.skippedIssues > 0) {
    report.warnings.push(
      `${report.skippedIssues} issue(s) were skipped because they are already recorded as imported.`,
    );
  }
  report.warnings.push(
    "Issue history (changelog) is not migrated in this version; it remains in Jira.",
  );

  // Relations need every task to exist first, so they run after the issue loop.
  await importRelations({ kaneo, issues, epicLinkFieldId, report, onProgress });
}

async function importIssue(context: {
  jira: JiraClient;
  kaneo: KaneoClient;
  workspaceId: string;
  projectId: string;
  issue: JiraIssue;
  comments: JiraComment[];
  worklogs: JiraWorklog[];
  plan: ReturnType<typeof planStatusColumns>;
  membersByEmail: Map<string, string>;
  customField: {
    kaneoFieldByJiraId: Map<string, { id: string }>;
    plan: CustomFieldSummary;
  };
  epicLinkFieldId: string | null;
  skipComments: boolean;
  skipAttachments: boolean;
  createdLabelNames: Set<string>;
  report: ProjectReport;
  onProgress: (message: string) => void;
}): Promise<void> {
  const {
    jira,
    kaneo,
    workspaceId,
    projectId,
    issue,
    comments,
    worklogs,
    plan,
    membersByEmail,
    customField,
    skipComments,
    skipAttachments,
    createdLabelNames,
    report,
    onProgress,
  } = context;

  const warnings: string[] = [];
  const mediaMap = new Map<
    string,
    { id: string; url: string; filename: string; isImage: boolean }
  >();
  const skippedAttachments: JiraAttachment[] = [];

  if (!skipAttachments) {
    for (const attachment of issue.fields.attachment ?? []) {
      const outcome = await importAttachment({
        jira,
        kaneo,
        projectId,
        attachment,
        mediaMap,
        warnings,
      });

      if (outcome === "uploaded") {
        report.attachments.uploaded++;
      } else if (outcome === "skipped") {
        report.attachments.skipped++;
        skippedAttachments.push(attachment);
      } else if (outcome === "failed") {
        report.attachments.failed++;
        skippedAttachments.push(attachment);
      }
    }
  } else if ((issue.fields.attachment?.length ?? 0) > 0) {
    report.attachments.skipped += issue.fields.attachment?.length ?? 0;
    skippedAttachments.push(...(issue.fields.attachment ?? []));
  }

  const description = adfToMarkdown(issue.fields.description);
  for (const unknown of description.unknownNodes) {
    warnings.push(
      `Description contains "${unknown}" content imported as plain text.`,
    );
  }

  const descriptionMarkdown = replaceMediaTokens(
    description.markdown,
    description.media,
    mediaMap,
    warnings,
  );

  const appendix = buildAppendix(
    appendixEntries(issue, skippedAttachments, customField.plan, jira.baseUrl),
  );

  const status =
    plan.slugByStatusName.get(issue.fields.status?.name ?? "") ??
    plan.columns[0]?.slug;

  const dates = toDateRange(issue.fields);

  const assigneeId = issue.fields.assignee?.emailAddress
    ? membersByEmail.get(issue.fields.assignee.emailAddress.toLowerCase())
    : undefined;

  if (issue.fields.assignee && !assigneeId) {
    warnings.push(
      `Assignee "${displayName(issue.fields.assignee)}" has no matching Kaneo workspace member; the assignment stays in the appendix.`,
    );
  }

  const customFieldValues = [...customField.kaneoFieldByJiraId.entries()]
    .map(([jiraId, field]) => {
      const planned = customField.plan.planned.find(
        (item) => item.jiraId === jiraId,
      );
      const value = planned?.values.get(issue.key);
      return value ? { fieldId: field.id, value } : null;
    })
    .filter(
      (entry): entry is { fieldId: string; value: string } => entry !== null,
    );

  // Every uploaded attachment is linked to the task through draftAssetIds.
  const assetIds = [...mediaMap.values()].map((asset) => asset.id);

  const task = await kaneo.createTask(projectId, {
    title: toTitle(issue),
    description: appendSections([descriptionMarkdown, appendix]),
    status: status ?? "to-do",
    priority: toPriority(issue.fields.priority?.name),
    ...(dates.startDate ? { startDate: dates.startDate } : {}),
    ...(dates.dueDate ? { dueDate: dates.dueDate } : {}),
    ...(assigneeId ? { userId: assigneeId } : {}),
    ...(assetIds.length > 0 ? { draftAssetIds: assetIds } : {}),
    ...(customFieldValues.length > 0
      ? { customFields: customFieldValues }
      : {}),
  });
  report.taskIds[issue.key] = task.id;
  report.tasks++;

  for (const labelName of labelsForIssue(issue)) {
    try {
      await kaneo.createLabel({
        name: labelName,
        color: labelColorFor(labelName),
        workspaceId,
        taskId: task.id,
      });
      if (!createdLabelNames.has(labelName)) {
        createdLabelNames.add(labelName);
        report.labels++;
      }
    } catch (error) {
      warnings.push(
        `Label "${labelName}" could not be applied: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  if (!skipComments) {
    for (const comment of comments) {
      const body = adfToMarkdown(comment.body);
      for (const unknown of body.unknownNodes) {
        warnings.push(
          `A comment contains "${unknown}" content imported as plain text.`,
        );
      }

      const markdown = replaceMediaTokens(
        body.markdown,
        body.media,
        mediaMap,
        warnings,
      );
      const content = formatImportedComment(markdown, comment);

      await kaneo.createComment(
        task.id,
        content,
        displayName(comment.author),
        "jira",
      );
      report.comments++;
    }
  }

  for (const worklog of worklogs) {
    const times = worklogTimes(worklog);
    if (!times.startTime) continue;

    const description = worklogDescription(worklog);
    await kaneo.createTimeEntry({
      taskId: task.id,
      startTime: times.startTime,
      ...(times.endTime ? { endTime: times.endTime } : {}),
      ...(description ? { description } : {}),
    });
    report.worklogs++;
  }

  report.warnings.push(...dedupeWarnings(warnings));
  onProgress(`Imported ${issue.key}`);
}

async function importAttachment(context: {
  jira: JiraClient;
  kaneo: KaneoClient;
  projectId: string;
  attachment: JiraAttachment;
  mediaMap: Map<
    string,
    { id: string; url: string; filename: string; isImage: boolean }
  >;
  warnings: string[];
}): Promise<"uploaded" | "skipped" | "failed"> {
  const { jira, kaneo, projectId, attachment, mediaMap, warnings } = context;

  if (!attachment.content) return "skipped";

  const expectedSize = attachment.size ?? 0;
  if (expectedSize > MAX_ATTACHMENT_BYTES) return "skipped";

  try {
    const { bytes, contentType } = await jira.downloadAttachment(
      attachment.content,
    );
    if (bytes.byteLength > MAX_ATTACHMENT_BYTES) return "skipped";

    const effectiveType =
      attachment.mimeType ?? contentType ?? "application/octet-stream";
    const staged = await kaneo.stageTaskAsset(projectId, {
      filename: attachment.filename,
      contentType: effectiveType,
      size: bytes.byteLength,
    });

    await kaneo.uploadAssetBytes(staged.uploadUrl, staged.headers, bytes);
    const finalized = await kaneo.finalizeStagedTaskAsset(projectId, {
      key: staged.key,
      filename: attachment.filename,
      contentType: effectiveType,
      size: bytes.byteLength,
    });

    mediaMap.set(attachment.id, {
      id: finalized.id,
      url: finalized.url,
      filename: attachment.filename,
      isImage: effectiveType.toLowerCase().startsWith("image/"),
    });
    return "uploaded";
  } catch (error) {
    warnings.push(
      `Attachment "${attachment.filename}" could not be transferred: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return "failed";
  }
}

function replaceMediaTokens(
  markdown: string,
  media: MediaRef[],
  mediaMap: Map<
    string,
    { id: string; url: string; filename: string; isImage: boolean }
  >,
  warnings: string[],
): string {
  let result = markdown;

  for (const ref of media) {
    if (ref.external) continue; // External images carry their own URL.
    const token = `%%JIRA-MEDIA:${ref.id}%%`;
    if (!result.includes(token)) continue;

    const asset = mediaMap.get(ref.id);
    if (!asset) {
      warnings.push(
        `An embedded image (${ref.id}) was not available as an attachment.`,
      );
      result = result.split(token).join("_(attachment not available)_");
      continue;
    }

    const replacement = asset.isImage
      ? `![${asset.filename}](${asset.url})`
      : `[${asset.filename}](${asset.url})`;
    result = result.split(token).join(replacement);
  }

  return result;
}

function formatImportedComment(markdown: string, comment: JiraComment): string {
  const date = comment.created
    ? new Date(comment.created).toISOString().slice(0, 10)
    : null;
  const who = displayName(comment.author);

  return date
    ? `${markdown}\n\n_Originally commented by ${who} on ${date}._`
    : `${markdown}\n\n_Originally commented by ${who}._`;
}

function worklogDescription(worklog: JiraWorklog): string | undefined {
  const who = displayName(worklog.author);
  const when = worklog.started
    ? new Date(worklog.started).toISOString().slice(0, 10)
    : null;

  const comment =
    typeof worklog.comment === "string"
      ? worklog.comment.trim()
      : worklog.comment
        ? adfToMarkdown(worklog.comment).markdown.trim()
        : "";

  const prefix = when ? `${who} on ${when}` : who;
  return comment ? `${prefix}: ${comment}` : prefix;
}

function appendixEntries(
  issue: JiraIssue,
  skippedAttachments: JiraAttachment[],
  customFieldPlan: CustomFieldSummary,
  jiraBaseUrl: string,
): AppendixEntry[] {
  const fields = issue.fields;
  const entries: AppendixEntry[] = [
    { label: "Issue key", value: issue.key },
    {
      label: "Link",
      value: `${jiraBaseUrl.replace(/\/+$/, "")}/browse/${issue.key}`,
    },
    {
      label: "Reporter",
      value: fields.reporter ? displayName(fields.reporter) : null,
    },
    {
      label: "Creator",
      value:
        fields.creator && fields.creator !== fields.reporter
          ? displayName(fields.creator)
          : null,
    },
    { label: "Created", value: fields.created },
    { label: "Updated", value: fields.updated },
    {
      label: "Resolved",
      value: fields.resolutiondate
        ? `${fields.resolution?.name ?? "Resolved"} ${fields.resolutiondate}`
        : null,
    },
    {
      label: "Environment",
      value:
        typeof fields.environment === "string"
          ? fields.environment
          : fields.environment
            ? adfToMarkdown(fields.environment).markdown
            : null,
    },
    { label: "Security level", value: fields.security?.name ?? null },
    { label: "Watchers", value: fields.watches?.watchCount ?? null },
    { label: "Votes", value: fields.votes?.votes ?? null },
  ];

  const sprint = sprintForIssue(issue);
  if (sprint) {
    entries.push({
      label: "Sprint",
      value: `${sprint.name}${sprint.state ? ` (${sprint.state})` : ""}${
        sprint.goal ? ` — ${sprint.goal}` : ""
      }`,
    });
  }

  for (const item of customFieldPlan.unmapped) {
    if (item.issueKey !== issue.key) continue;
    entries.push({ label: `Jira field: ${item.name}`, value: item.value });
  }

  if (skippedAttachments.length > 0) {
    entries.push({
      label: "Attachments not transferred",
      value: skippedAttachments
        .map(
          (attachment) =>
            `${attachment.filename} (${attachment.mimeType ?? "unknown type"}, ${
              attachment.size ?? "?"
            } bytes, id ${attachment.id})`,
        )
        .join("; "),
    });
  }

  return entries;
}

async function importRelations(context: {
  kaneo: KaneoClient;
  issues: JiraIssue[];
  epicLinkFieldId: string | null;
  report: ProjectReport;
  onProgress: (message: string) => void;
}): Promise<void> {
  const { kaneo, issues, epicLinkFieldId, report, onProgress } = context;

  const seen = new Set<string>();

  const resolve = (key: string): string | null => report.taskIds[key] ?? null;

  for (const issue of issues) {
    const planned: {
      relationType: "subtask" | "blocks" | "related";
      sourceKey: string;
      targetKey: string;
    }[] = [];

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
      const epicKey = issue.fields[epicLinkFieldId];
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
      if (subtask.key !== issue.key) {
        planned.push({
          relationType: "subtask",
          sourceKey: issue.key,
          targetKey: subtask.key,
        });
      }
    }

    for (const link of issue.fields.issuelinks ?? []) {
      const relation = relationForLink(issue, link);
      if (relation) {
        planned.push({
          relationType: relation.relationType,
          sourceKey: relation.sourceKey,
          targetKey: relation.targetKey,
        });
      }
    }

    for (const relation of planned) {
      const canonical = `${relation.relationType}|${relation.sourceKey}|${relation.targetKey}`;
      if (seen.has(canonical)) continue;
      seen.add(canonical);

      const sourceTaskId = resolve(relation.sourceKey);
      const targetTaskId = resolve(relation.targetKey);
      if (!sourceTaskId || !targetTaskId || sourceTaskId === targetTaskId) {
        // Cross-project links whose other side was not imported stay in the
        // report rather than failing the run.
        report.warnings.push(
          `Relation ${relation.relationType} ${relation.sourceKey} → ${relation.targetKey} was skipped: one side was not imported.`,
        );
        continue;
      }

      try {
        await kaneo.createTaskRelation({
          sourceTaskId,
          targetTaskId,
          relationType: relation.relationType,
        });
        report.relations++;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!/exist|duplicate|already/i.test(message)) {
          report.warnings.push(
            `Relation ${relation.relationType} ${relation.sourceKey} → ${relation.targetKey} failed: ${message}`,
          );
        }
      }
      onProgress(`Linked ${relation.sourceKey} → ${relation.targetKey}`);
    }
  }
}

function dedupeWarnings(warnings: string[]): string[] {
  return [...new Set(warnings)];
}

/**
 * Records a Jira user by their Jira-side identity. The same person can appear
 * with and without an email depending on the payload; the entry keeps the
 * email as soon as one is seen.
 */
function collectJiraUser(
  users: Map<string, JiraUser>,
  user: JiraUser | null | undefined,
): void {
  if (!user) return;

  const identity =
    user.accountId ??
    user.key ??
    user.emailAddress?.trim().toLowerCase() ??
    user.displayName;
  if (!identity) return;

  const existing = users.get(identity);
  if (!existing) {
    users.set(identity, user);
    return;
  }
  if (!existing.emailAddress && user.emailAddress) {
    users.set(identity, { ...existing, emailAddress: user.emailAddress });
  }
}
