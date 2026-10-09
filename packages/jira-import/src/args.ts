export type StatusFilter = "all" | "open" | "in-progress" | "closed";

export type ParsedArgs = {
  jiraUrl?: string;
  jiraEmail?: string;
  jiraToken?: string;
  jiraPat?: string;
  kaneoUrl?: string;
  kaneoApiKey?: string;
  workspace?: string;
  projects: string[];
  types: string[];
  labels: string[];
  assignee?: string;
  updatedAfter?: string;
  jql?: string;
  status: StatusFilter;
  icon?: string;
  report?: string;
  all: boolean;
  dryRun: boolean;
  skipComments: boolean;
  skipAttachments: boolean;
  inviteUsers: boolean;
  inviteEmails: string[];
  yes: boolean;
  help: boolean;
  version: boolean;
};

const STRING_FLAGS: Record<string, keyof ParsedArgs> = {
  "--jira-url": "jiraUrl",
  "--jira-email": "jiraEmail",
  "--jira-token": "jiraToken",
  "--jira-pat": "jiraPat",
  "--kaneo-url": "kaneoUrl",
  "--kaneo-api-key": "kaneoApiKey",
  "--workspace": "workspace",
  "--assignee": "assignee",
  "--updated-after": "updatedAfter",
  "--jql": "jql",
  "--icon": "icon",
  "--report": "report",
};

const REPEATABLE_FLAGS: Record<string, keyof ParsedArgs> = {
  "--project": "projects",
  "--type": "types",
  "--label": "labels",
};

const STATUS_VALUES: StatusFilter[] = ["all", "open", "in-progress", "closed"];

const BOOLEAN_FLAGS: Record<string, keyof ParsedArgs> = {
  "--all": "all",
  "--dry-run": "dryRun",
  "--skip-comments": "skipComments",
  "--skip-attachments": "skipAttachments",
  "--yes": "yes",
  "-y": "yes",
  "--help": "help",
  "-h": "help",
  "--version": "version",
  "-v": "version",
};

export function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    projects: [],
    types: [],
    labels: [],
    status: "all",
    all: false,
    dryRun: false,
    skipComments: false,
    skipAttachments: false,
    inviteUsers: true,
    inviteEmails: [],
    yes: false,
    help: false,
    version: false,
  };

  for (let index = 0; index < argv.length; index++) {
    const raw = argv[index] as string;
    const equals = raw.indexOf("=");
    const flag = equals === -1 ? raw : raw.slice(0, equals);
    const inlineValue = equals === -1 ? undefined : raw.slice(equals + 1);

    if (flag in BOOLEAN_FLAGS) {
      const key = BOOLEAN_FLAGS[flag] as
        | "all"
        | "dryRun"
        | "skipComments"
        | "skipAttachments"
        | "yes"
        | "help"
        | "version";
      parsed[key] = true;
      continue;
    }

    if (flag in REPEATABLE_FLAGS) {
      const value = inlineValue ?? argv[++index];
      if (value === undefined) throw new Error(`${flag} requires a value`);
      const key = REPEATABLE_FLAGS[flag] as "projects" | "types" | "labels";
      (parsed[key] as string[]).push(value);
      continue;
    }

    if (flag === "--status") {
      const value = inlineValue ?? argv[++index];
      if (value === undefined) throw new Error("--status requires a value");
      if (!STATUS_VALUES.includes(value as StatusFilter)) {
        throw new Error(`--status must be one of: ${STATUS_VALUES.join(", ")}`);
      }
      parsed.status = value as StatusFilter;
      continue;
    }

    if (flag === "--no-invite-users") {
      parsed.inviteUsers = false;
      continue;
    }

    if (flag === "--invite-emails") {
      const value = inlineValue ?? argv[++index];
      if (value === undefined) {
        throw new Error("--invite-emails requires a value");
      }
      for (const address of value.split(",")) {
        const trimmed = address.trim().toLowerCase();
        if (trimmed && !parsed.inviteEmails.includes(trimmed)) {
          parsed.inviteEmails.push(trimmed);
        }
      }
      continue;
    }

    if (flag in STRING_FLAGS) {
      const value = inlineValue ?? argv[++index];
      if (value === undefined) throw new Error(`${flag} requires a value`);
      const key = STRING_FLAGS[flag] as Exclude<
        keyof ParsedArgs,
        | "projects"
        | "types"
        | "labels"
        | "status"
        | "all"
        | "dryRun"
        | "skipComments"
        | "skipAttachments"
        | "inviteUsers"
        | "inviteEmails"
        | "yes"
        | "help"
        | "version"
      >;
      parsed[key] = value;
      continue;
    }

    throw new Error(`Unknown option: ${flag}`);
  }

  return parsed;
}

const STATUS_JQL: Record<Exclude<StatusFilter, "all">, string> = {
  // Jira groups statuses by status category; these presets are its own buckets.
  open: 'statusCategory = "To Do"',
  "in-progress": 'statusCategory = "In Progress"',
  closed: 'statusCategory = "Done"',
};

function jiraQuote(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`;
}

function inClause(field: string, values: string[]): string {
  return `${field} IN (${values.map(jiraQuote).join(", ")})`;
}

/**
 * Compose the filter part of the search JQL. The project clause is added per
 * project by the migration, because each Jira project becomes its own Kaneo
 * project; this function covers everything the user selected or typed.
 */
export function buildJql(args: ParsedArgs): string {
  const clauses: string[] = [];

  if (args.status !== "all") {
    const statusClause = STATUS_JQL[args.status];
    if (statusClause) clauses.push(statusClause);
  }

  if (args.types.length > 0) clauses.push(inClause("issuetype", args.types));
  if (args.labels.length > 0) clauses.push(inClause("labels", args.labels));
  if (args.assignee) clauses.push(`assignee = ${jiraQuote(args.assignee)}`);
  if (args.updatedAfter) {
    clauses.push(`updated >= ${jiraQuote(args.updatedAfter)}`);
  }

  // JQL binds OR more loosely than AND, so a raw query is always wrapped
  // before it is AND-combined with the generated clauses.
  const raw = args.jql?.trim();
  if (raw) clauses.push(`(${raw})`);

  return clauses.join(" AND ");
}

export const DEFAULT_KANEO_URL = "https://cloud.kaneo.app";

export const HELP_TEXT = `kaneo-jira-import: migrate Jira projects into Kaneo

Usage:
  npx @kaneo/jira-import --jira-url <url> --dry-run
  npx @kaneo/jira-import --jira-url <url> --kaneo-api-key <key> [options]

Jira source:
  --jira-url <url>          Jira instance URL (required)
  --jira-email <email>      Your Jira email, for API token auth (prompted if omitted)
  --jira-token <token>      Jira Cloud API token (env JIRA_API_TOKEN, or prompted)
  --jira-pat <token>        Jira Data Center personal access token (env JIRA_PAT)

Kaneo target:
  --kaneo-url <url>         Kaneo instance URL (default ${DEFAULT_KANEO_URL})
  --kaneo-api-key <key>     Kaneo API key (env KANEO_API_KEY)
  --workspace <id>          Target workspace ID (prompted if omitted)

Selection:
  --project <key>           Migrate only this Jira project (repeatable)
  --all                     Migrate every accessible project without prompting
  --status <preset>         all (default), open, in-progress or closed
  --type <name>             Only these issue types (repeatable)
  --label <name>            Only issues with these labels (repeatable)
  --assignee <user>         Only issues assigned to this user
  --updated-after <date>    Only issues updated since this date (YYYY-MM-DD)
  --jql '<raw>'             Extra JQL, AND-combined with the filters above

Behaviour:
  --dry-run                 Report what would be migrated, write nothing
  --skip-comments           Do not migrate issue comments
  --skip-attachments       Do not migrate attachments
  --icon <name>             Lucide icon for created projects (default Layout)
  --report <path>           Write a JSON report to this path. When the report
                            already exists, issues it recorded are skipped and
                            the import continues where it stopped
  --no-invite-users         Do not invite Jira users to the workspace
  --invite-emails <list>    Comma-separated addresses to send the invitation
                            email to (non-interactive selection); everyone
                            else is invited without an email
  -y, --yes                 Do not ask for confirmation before writing
  -h, --help                Show this help
  -v, --version             Show the version

Examples:
  npx @kaneo/jira-import --jira-url https://acme.atlassian.net --dry-run
  npx @kaneo/jira-import --jira-url https://acme.atlassian.net \\
    --status closed --project SUP --kaneo-api-key kaneo_xxx --workspace ws_123
`;
