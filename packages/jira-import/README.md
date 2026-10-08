# @kaneo/jira-import

Migrate your [Jira](https://www.atlassian.com/software/jira) projects into [Kaneo](https://kaneo.app).

The CLI reads issues directly from Jira's REST API and creates them through Kaneo's public API. It does not modify Jira or use an intermediary migration service.

## Usage

```bash
npx @kaneo/jira-import --jira-url https://acme.atlassian.net --dry-run
```

A dry run reads Jira only and prints exactly what would be created. When the
plan looks right, set `KANEO_API_KEY` in your environment and drop `--dry-run`:

```bash
npx @kaneo/jira-import \
  --jira-url https://acme.atlassian.net \
  --kaneo-url https://cloud.kaneo.app \
  --workspace ws_123
```

You'll be prompted for your Jira credentials and for which projects to migrate.

Create a Kaneo API key under **Settings → Account → API Keys**. Self-hosting? Point
`--kaneo-url` at your own instance.

For Jira Cloud, pass your email with `--jira-email` and an API token created at
[id.atlassian.com/manage-profile/security/api-tokens](https://id.atlassian.com/manage-profile/security/api-tokens) with `--jira-token`. For Jira Data Center, create a personal access token in your Jira profile and pass it with `--jira-pat`.

## What carries over

| Jira | Kaneo |
| --- | --- |
| Project | Project, one per Jira project |
| Status | Column, ordered To Do → In Progress → Done; the last Done column is marked final |
| Issue | Task, titled `[KEY] summary` so the Jira key survives |
| Description (ADF) | Task description, converted to Markdown |
| Attachments | Uploaded and embedded in the description; files above 10 MB are listed in the appendix instead |
| Images in the description | Uploaded and embedded in place |
| Priority | Task priority (Highest → urgent, High → high, Medium → medium, Low → low, Lowest → no-priority) |
| Labels, issue type, components, affected versions | Labels (`type:`, `component:`, `version:` prefixes) |
| Assignee | Assignee, matched by email address |
| Created date, due date | Start date, due date |
| Comments | Comments, with the original author recorded separately and the original date added to the text |
| Worklogs | Time entries |
| Custom fields | Kaneo custom fields when the type fits (number, date, option → dropdown, text); everything else lands in the appendix |
| Sub-issues, Epic Link | Task relations (subtask) |
| Issue links (Blocks, relates to, …) | Task relations (blocks, related) |
| Sprint | Label and appendix entry |

Everything Kaneo has no native field for — reporter, environment, security level,
watchers, votes, resolution dates and unmapped custom fields — is preserved in an
"Imported from Jira" appendix at the end of each task description. Nothing is
dropped silently, and the import report tells you exactly what was migrated.

## What doesn't

- **Issue history.** Jira's changelog is not transferred; only a note that history stays in Jira.
- **Attachments above 10 MB.** Kaneo's staged upload accepts up to 10 MB per file; larger attachments stay in Jira and are listed in the task appendix.
- **Comment authorship.** The comment is created by the API key's owner, but the original Jira author is recorded and displayed alongside it.
- **Cross-project links.** Relations only connect issues migrated in the same run; links to issues in other projects are reported as warnings.

**Invite your team first.** Assignees only match when the person already exists in the target Kaneo workspace with the same email address.

## Options

| Flag | Description |
| --- | --- |
| `--jira-url <url>` | Jira instance URL (required) |
| `--jira-email <email>` | Your Jira email, for API token auth (prompted if omitted) |
| `--jira-token <token>` | Jira Cloud API token (or set `JIRA_API_TOKEN`) |
| `--jira-pat <token>` | Jira Data Center personal access token (or set `JIRA_PAT`) |
| `--kaneo-url <url>` | Kaneo instance URL (default `https://cloud.kaneo.app`) |
| `--kaneo-api-key <key>` | Kaneo API key (or set `KANEO_API_KEY`) |
| `--workspace <id>` | Target workspace (prompted if omitted) |
| `--project <key>` | Migrate only this Jira project (repeatable) |
| `--all` | Migrate every accessible project without prompting |
| `--status <preset>` | `all` (default), `open`, `in-progress` or `closed` |
| `--type <name>` | Only these issue types (repeatable) |
| `--label <name>` | Only issues with these labels (repeatable) |
| `--assignee <user>` | Only issues assigned to this user |
| `--updated-after <date>` | Only issues updated since this date (`YYYY-MM-DD`) |
| `--jql '<raw>'` | Extra JQL, AND-combined with the filters above |
| `--dry-run` | Report what would be migrated, write nothing |
| `--skip-comments` | Don't migrate comments |
| `--skip-attachments` | Don't migrate attachments |
| `--icon <name>` | Lucide icon for created projects (default `Layout`) |
| `--report <path>` | Write a JSON report |
| `-y, --yes` | Skip the confirmation prompt |

Status presets map to Jira's status categories: `open` is To Do, `in-progress` is
In Progress and `closed` is Done. For anything more precise, pass raw JQL, for
example `--jql 'fixVersion = "2.0" ORDER BY created DESC'`.

## Re-running and resuming

The importer always creates new projects; it does not update ones it created
earlier. Project-level failures are isolated, so one broken project won't stop
the rest, and the summary tells you which ones failed.

Pass `--report` to write a JSON report of every run. When the file already
exists, issues it recorded are skipped and their existing Kaneo tasks are still
used as relation targets, so an interrupted import continues where it stopped
without creating duplicates. The CLI exits non-zero when any project failed or
the report shows a gap between what Jira had and what Kaneo received.

## License

MIT
