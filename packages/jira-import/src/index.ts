#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import prompts from "prompts";
import {
  DEFAULT_KANEO_URL,
  type ParsedArgs,
  buildJql,
  parseArgs,
  HELP_TEXT,
} from "./args.js";
import {
  invitationLink,
  planInvitations,
  selectEmailedEmails,
} from "./invitations.js";
import {
  KaneoClient,
  type KaneoInvitationResult,
  type KaneoMember,
} from "./kaneo.js";
import type { JiraProjectTarget } from "./migrate.js";
import { migrate, type ProjectReport } from "./migrate.js";
import { JiraClient, type JiraProject, type JiraUser } from "./jira.js";

const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version: string };

type PreviousReport = {
  reports?: ProjectReport[];
  invitations?: KaneoInvitationResult[];
};

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    process.stdout.write(HELP_TEXT);
    return 0;
  }

  if (args.version) {
    process.stdout.write(`${version}\n`);
    return 0;
  }

  const interactive = process.stdin.isTTY === true;

  const jiraUrl = args.jiraUrl ?? envOrUndefined("JIRA_URL");
  const jiraEmail = args.jiraEmail ?? envOrUndefined("JIRA_EMAIL");
  const jiraToken = args.jiraToken ?? envOrUndefined("JIRA_API_TOKEN");
  const jiraPat = args.jiraPat ?? envOrUndefined("JIRA_PAT");

  if (!jiraUrl) {
    if (!interactive) throw new Error("--jira-url is required");
    const answer = (await prompts({
      type: "text",
      name: "value",
      message: "Jira instance URL",
    })) as { value?: string };
    if (!answer.value) throw new Error("--jira-url is required");
    return runInteractive(
      args,
      answer.value,
      jiraEmail,
      jiraToken,
      jiraPat,
      interactive,
    );
  }

  return runInteractive(
    args,
    jiraUrl,
    jiraEmail,
    jiraToken,
    jiraPat,
    interactive,
  );
}

async function runInteractive(
  args: ParsedArgs,
  jiraUrl: string,
  jiraEmail: string | undefined,
  jiraToken: string | undefined,
  jiraPat: string | undefined,
  interactive: boolean,
): Promise<number> {
  let email = jiraEmail;
  let token = jiraToken;
  let pat = jiraPat;

  if (!token && !pat) {
    email =
      email ??
      (await ask(interactive, {
        type: "text",
        name: "value",
        message: "Jira email (API token auth)",
      }));
    if (!email) throw new Error("--jira-email is required");

    pat = await ask(interactive, {
      type: "password",
      name: "value",
      message:
        "Jira API token (or set JIRA_API_TOKEN; enter a personal access token for Data Center)",
    });
    if (!pat) throw new Error("--jira-token or --jira-pat is required");

    // A Cloud API token and a Data Center PAT look identical from here; the
    // Basic vs Bearer choice follows whichever flag was used explicitly.
    if (!args.jiraPat && !envOrUndefined("JIRA_PAT")) {
      token = pat;
      pat = undefined;
    }
  }

  if (token && !email) {
    throw new Error(
      "API token auth also needs an email. Pass --jira-email or set JIRA_EMAIL.",
    );
  }

  const jira = new JiraClient({
    baseUrl: jiraUrl,
    email,
    apiToken: token,
    pat,
  });

  const myself = await jira.getMyself();
  log(
    `Authenticated with Jira as ${myself.displayName ?? myself.emailAddress ?? "user"}`,
  );

  const projects = (await jira.listProjects()).filter((project) =>
    isMigratable(project),
  );

  if (projects.length === 0) {
    log("No accessible Jira projects found for this account.");
    return 0;
  }

  const targets = await selectTargets(projects, args, interactive);
  if (targets.length === 0) {
    log("Nothing selected.");
    return 0;
  }

  const kaneoApiKey = args.kaneoApiKey ?? envOrUndefined("KANEO_API_KEY");
  if (!kaneoApiKey && !args.dryRun) {
    throw new Error(
      "A Kaneo API key is required. Pass --kaneo-api-key or set KANEO_API_KEY.",
    );
  }

  const kaneo = new KaneoClient({
    baseUrl: args.kaneoUrl ?? DEFAULT_KANEO_URL,
    apiKey: kaneoApiKey ?? "",
  });

  let workspaceId = args.workspace ?? "";
  if (!args.dryRun && !workspaceId) {
    workspaceId = await selectWorkspace(kaneo, interactive);
  }

  const filterJql = buildJql(args);
  const importedTasks = await loadImportedTasks(args.report);
  const jiraUsers = new Map<string, JiraUser>();

  const preview = await migrate({
    jira,
    kaneo,
    workspaceId,
    targets,
    filterJql,
    dryRun: true,
    skipComments: args.skipComments,
    skipAttachments: args.skipAttachments,
    importedTasks,
    jiraUsers,
    onProgress: () => {},
  });

  printPlan(preview, args);

  if (jiraUsers.size > 0) {
    log(`Seen ${jiraUsers.size} Jira user(s) across the selected projects.`);
  }

  if (args.dryRun) {
    await writeReport(args.report, preview);
    log("Dry run. Nothing was written to Kaneo.");
    return 0;
  }

  if (!args.yes) {
    const confirmed = await confirm(
      interactive,
      `Import ${preview.reduce((total, report) => total + report.sourceCounts.issues, 0)} issue(s) into Kaneo workspace ${workspaceId}?`,
    );
    if (!confirmed) {
      log("Aborted.");
      return 1;
    }
  }

  // Invitations happen before the import so the long migration runs
  // unattended afterwards; a failure here never fails the migration.
  let invitationResults: KaneoInvitationResult[] | null = null;
  if (args.inviteUsers) {
    invitationResults = await inviteJiraUsers({
      kaneo,
      workspaceId,
      jiraUsers,
      inviteEmails: args.inviteEmails,
      interactive,
    });
  }

  const reports = await migrate({
    jira,
    kaneo,
    workspaceId,
    targets,
    filterJql,
    dryRun: false,
    skipComments: args.skipComments,
    skipAttachments: args.skipAttachments,
    ...(args.icon ? { projectIcon: args.icon } : {}),
    importedTasks,
    jiraUsers,
    onProgress: progress,
  });

  clearProgress();
  printResults(reports);

  if (invitationResults) {
    printInvitationResults(invitationResults, kaneo.baseUrl);
  }

  await writeReport(args.report, reports, invitationResults ?? undefined);

  const failed = reports.filter((report) => report.failed).length;
  const incomplete = reports.filter(
    (report) => !coverageComplete(report),
  ).length;

  if (failed > 0) return 1;
  return incomplete > 0 ? 1 : 0;
}

// Software and service desk projects expose the issue APIs this importer needs.
function isMigratable(project: JiraProject): boolean {
  const key = project.key?.trim();
  return Boolean(key && project.name?.trim());
}

async function selectTargets(
  projects: JiraProject[],
  args: ParsedArgs,
  interactive: boolean,
): Promise<JiraProjectTarget[]> {
  if (args.projects.length > 0) {
    const wanted = args.projects.map((value) => value.toLowerCase());
    const matched = projects.filter(
      (project) =>
        wanted.includes(project.key.toLowerCase()) ||
        wanted.includes(project.name.toLowerCase()),
    );

    const missing = wanted.filter(
      (key) =>
        !matched.some(
          (project) =>
            project.key.toLowerCase() === key ||
            project.name.toLowerCase() === key,
        ),
    );

    if (missing.length > 0) {
      throw new Error(
        `No Jira project matched: ${missing.join(", ")}. Available: ${projects
          .map((project) => `${project.key} (${project.name})`)
          .join(", ")}`,
      );
    }
    return matched.map((project) => ({ key: project.key, name: project.name }));
  }

  if (args.all || !interactive) {
    return projects.map((project) => ({
      key: project.key,
      name: project.name,
    }));
  }

  const answer = await prompts({
    type: "multiselect",
    name: "value",
    message: "Select projects to migrate",
    instructions: false,
    choices: projects.map((project) => ({
      title: `${project.key} — ${project.name}`,
      value: project,
      selected: true,
    })),
  });

  return ((answer.value as JiraProject[] | undefined) ?? []).map((project) => ({
    key: project.key,
    name: project.name,
  }));
}

async function selectWorkspace(
  kaneo: KaneoClient,
  interactive: boolean,
): Promise<string> {
  const workspaces = await kaneo.listWorkspaces();

  if (workspaces.length === 0) {
    throw new Error("This Kaneo account has no workspaces.");
  }

  const first = workspaces[0];
  if (workspaces.length === 1 && first) return first.id;

  if (!interactive) {
    throw new Error(
      `Several workspaces are available; pass --workspace with one of: ${workspaces
        .map((workspace) => `${workspace.name} (${workspace.id})`)
        .join(", ")}`,
    );
  }

  const answer = await prompts({
    type: "select",
    name: "value",
    message: "Target Kaneo workspace",
    choices: workspaces.map((workspace) => ({
      title: workspace.name,
      value: workspace.id,
    })),
  });

  const chosen = answer.value as string | undefined;
  if (!chosen) throw new Error("No workspace selected.");
  return chosen;
}

/**
 * Invites the Jira users seen during the migration to the workspace. Every
 * candidate receives a pending invitation without an email; the admin (or
 * --invite-emails) decides who is actually notified, and everyone else gets
 * an accept link to share manually.
 */
async function inviteJiraUsers({
  kaneo,
  workspaceId,
  jiraUsers,
  inviteEmails,
  interactive,
}: {
  kaneo: KaneoClient;
  workspaceId: string;
  jiraUsers: Map<string, JiraUser>;
  inviteEmails: string[];
  interactive: boolean;
}): Promise<KaneoInvitationResult[] | null> {
  const members: KaneoMember[] = await kaneo.listMembers(workspaceId);
  const plan = planInvitations(
    jiraUsers.values(),
    members.map((member) => member.email),
  );

  if (plan.withoutEmail.length > 0) {
    log(
      `  ! ${plan.withoutEmail.length} Jira user(s) have no email address and cannot be invited: ${plan.withoutEmail.join(", ")}`,
    );
  }
  if (plan.alreadyMembers.length > 0) {
    log(
      `  ${plan.alreadyMembers.length} Jira user(s) are already workspace members and are not invited again.`,
    );
  }

  if (plan.candidates.length === 0) {
    return null;
  }

  const proceed = await confirm(
    interactive,
    `Invite ${plan.candidates.length} Jira user(s) to the workspace? Invitations are created without sending an email; you choose the recipients next.`,
  );
  if (!proceed) return null;

  let selected: string[];
  if (interactive) {
    const answer = await prompts({
      type: "multiselect",
      name: "value",
      message:
        "Which users should receive the invitation email? (Unselected users are still invited; their links are printed below.)",
      instructions: false,
      choices: plan.candidates.map((candidate) => ({
        title: `${candidate.name} <${candidate.email}>`,
        value: candidate.email,
        selected: false,
      })),
    });
    selected = ((answer.value as string[] | undefined) ?? []).map((email) =>
      email.toLowerCase(),
    );
  } else {
    const selection = selectEmailedEmails(plan.candidates, inviteEmails);
    for (const unknown of selection.unknown) {
      log(
        `  ! --invite-emails contains an address not seen in Jira: ${unknown}`,
      );
    }
    if (selection.selected.length === 0) {
      log(
        `  Creating invitations for ${plan.candidates.length} Jira user(s) without sending emails; pass --invite-emails to notify specific addresses.`,
      );
    }
    selected = selection.selected;
  }

  const emailed = new Set(selected);
  try {
    const { invitations } = await kaneo.createInvitations(workspaceId, {
      invitations: plan.candidates.map((candidate) => ({
        email: candidate.email,
        sendEmail: emailed.has(candidate.email),
      })),
    });
    return invitations;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/\b404\b/.test(message)) {
      log(
        "  ! This Kaneo instance does not support workspace invitations yet; no users were invited.",
      );
    } else {
      log(`  ! Workspace invitations failed: ${message}`);
    }
    return null;
  }
}

function printInvitationResults(
  results: KaneoInvitationResult[],
  baseUrl: string,
): void {
  log("");
  log("Workspace invitations:");
  for (const result of results) {
    if (result.status === "already_member") {
      log(`  • ${result.email} is already a workspace member.`);
      continue;
    }
    if (result.status === "error" || !result.id) {
      log(`  ✖ ${result.email}: ${result.error ?? "invitation failed"}`);
      continue;
    }

    const status =
      result.status === "already_invited" ? "already invited" : "created";
    const delivery = result.emailed
      ? "invitation email sent"
      : "share this link manually";
    log(`  • ${result.email} (${status}) — ${delivery}`);
    log(`      ${invitationLink(baseUrl, result.id)}`);
  }
  log("");
}

/**
 * Re-runs continue where the previous run stopped: every report records the
 * issue keys it already imported, and those tasks are skipped.
 */
async function loadImportedTasks(
  reportPath: string | undefined,
): Promise<Record<string, string>> {
  if (!reportPath) return {};

  try {
    const raw = await readFile(reportPath, "utf8");
    const parsed = JSON.parse(raw) as PreviousReport;
    const imported: Record<string, string> = {};
    for (const report of parsed.reports ?? []) {
      Object.assign(imported, report.taskIds);
    }
    return imported;
  } catch {
    return {};
  }
}

function printPlan(reports: ProjectReport[], args: ParsedArgs): void {
  log("");
  log(
    `Planned import${args.status !== "all" ? ` (status: ${args.status})` : ""}:`,
  );
  for (const report of reports) {
    if (report.failed) {
      log(`  ✖ ${report.projectName}: ${report.error}`);
      continue;
    }
    log(
      `  • ${report.projectName}  ${report.columns} columns  ` +
        `${report.sourceCounts.issues} issues  ` +
        `${report.sourceCounts.comments} comments  ` +
        `${report.sourceCounts.attachments} attachments  ` +
        `${report.sourceCounts.worklogs} worklogs  ` +
        `${report.sourceCounts.links} links`,
    );
    for (const warning of report.warnings) log(`      ! ${warning}`);
  }
  log("");
}

function printResults(reports: ProjectReport[]): void {
  log("");
  for (const report of reports) {
    if (report.failed) {
      log(`✖ ${report.projectName}: ${report.error}`);
      continue;
    }
    log(
      `✔ ${report.projectName} (${report.projectKey})  ` +
        `${report.columns} columns  ${report.tasks} tasks  ` +
        `${report.labels} labels  ${report.comments} comments  ` +
        `${report.relations} relations  ${report.worklogs} worklogs  ` +
        `${report.customFields} custom fields  ` +
        `attachments ${report.attachments.uploaded} uploaded / ` +
        `${report.attachments.skipped} skipped / ${report.attachments.failed} failed`,
    );

    const gaps = coverageGaps(report);
    for (const gap of gaps) log(`      ! ${gap}`);
  }

  const failed = reports.filter((report) => report.failed).length;
  const incomplete = reports.filter(
    (report) => !coverageComplete(report),
  ).length;
  log("");
  if (failed > 0) {
    log(`Finished with ${failed} failed project(s).`);
  } else if (incomplete > 0) {
    log(
      `Finished, but ${incomplete} project(s) have gaps: ` +
        `skipped or failed attachments stay in Jira, listed in the report. ` +
        `Re-run to retry, or adjust the filters.`,
    );
  } else {
    log("Finished. Everything imported.");
  }
}

/**
 * The 100% guarantee: source and imported counts must agree. Missing issues
 * (filtered on purpose) are not gaps; missing comments, attachments and
 * worklogs are.
 */
function coverageGaps(report: ProjectReport): string[] {
  const gaps: string[] = [];

  if (report.comments < report.sourceCounts.comments) {
    gaps.push(
      `Comments: ${report.comments} of ${report.sourceCounts.comments} migrated.`,
    );
  }
  if (
    report.attachments.uploaded +
      report.attachments.skipped +
      report.attachments.failed <
    report.sourceCounts.attachments
  ) {
    gaps.push(
      `Attachments: ${report.attachments.uploaded} of ${report.sourceCounts.attachments} migrated.`,
    );
  }
  if (report.worklogs < report.sourceCounts.worklogs) {
    gaps.push(
      `Worklogs: ${report.worklogs} of ${report.sourceCounts.worklogs} migrated.`,
    );
  }
  if (report.tasks + report.skippedIssues < report.sourceCounts.issues) {
    gaps.push(
      `Issues: ${report.tasks} created, ${report.skippedIssues} skipped (already imported), ` +
        `of ${report.sourceCounts.issues} selected.`,
    );
  }

  return gaps;
}

function coverageComplete(report: ProjectReport): boolean {
  return coverageGaps(report).length === 0;
}

async function writeReport(
  path: string | undefined,
  reports: ProjectReport[],
  invitations?: KaneoInvitationResult[],
): Promise<void> {
  if (!path) return;
  // invitations is omitted by JSON.stringify when undefined, keeping older
  // reports and dry runs identical to what they were.
  await writeFile(
    path,
    `${JSON.stringify({ reports, invitations }, null, 2)}\n`,
    "utf8",
  );
  log(`Report written to ${path}`);
}

function envOrUndefined(name: string): string | undefined {
  return process.env[name]?.trim() || undefined;
}

let progressActive = false;

function progress(message: string): void {
  if (!process.stdout.isTTY) return;
  process.stdout.write(`\r\u001B[2K${message}`);
  progressActive = true;
}

function clearProgress(): void {
  if (progressActive && process.stdout.isTTY) {
    process.stdout.write("\r\u001B[2K");
    progressActive = false;
  }
}

function log(message: string): void {
  clearProgress();
  process.stdout.write(`${message}\n`);
}

async function ask(
  interactive: boolean,
  question: prompts.PromptObject,
): Promise<string | undefined> {
  if (!interactive) return undefined;
  const answer = await prompts(question);
  const value = answer.value as string | undefined;
  return value?.trim() || undefined;
}

async function confirm(
  interactive: boolean,
  message: string,
): Promise<boolean> {
  if (!interactive) return true;
  const answer = await prompts({
    type: "confirm",
    name: "value",
    message,
    initial: true,
  });
  return answer.value === true;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    clearProgress();
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
