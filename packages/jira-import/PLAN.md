# Jira → Kaneo Import — Implementation Plan

Status: Proposed
Branch: `feat/jira-import-plan`
Future package: `packages/jira-import` (published as `@kaneo/jira-import`, mirroring `@kaneo/planka-import`)

## 1. Goal

A one-shot migration CLI that copies Jira issues into a Kaneo project with a 100% data transfer guarantee:

- Every issue field, comment, attachment (images and files), link, worklog, and piece of history is either mapped to a native Kaneo construct, stored as a custom field, preserved in a structured appendix, or stored as an attachment. Nothing is silently dropped.
- The user can filter what is imported by status (open, in-progress, closed, all), project, issue type, label, assignee, and date — or with arbitrary JQL.
- Attachments are stored in Kaneo storage, not merely linked back to Jira.
- A reconciliation report proves the 100% claim: source counts vs. imported counts per entity.

Non-goals:

- No live two-way sync. This is a one-way copy; the existing `integration-sync` provider framework (GitHub/GitLab/Gitea) is explicitly out of scope for v1.
- No writes to Jira. The tool never modifies the source instance.
- No in-app import wizard in v1. The CLI comes first, matching the proven `planka-import` pattern.

## 2. Findings: what exists today

### 2.1 Template: `packages/planka-import`

The repo already contains a migration CLI with the exact architecture this plan needs:

| Concern | planka-import module |
| --- | --- |
| CLI parsing, prompts, dry-run, report | `src/args.ts`, `src/index.ts` |
| Source API client | `src/planka.ts` |
| Target API client | `src/kaneo.ts` |
| Field mapping | `src/mapping.ts` |
| Orchestration, per-board isolation, reports | `src/migrate.ts` |
| Tests beside every module | `src/*.test.ts` |

Key lesson from its README: attachments are the one thing planka-import does NOT transfer (counted and reported only). For Jira this is unacceptable — the plan below closes that gap on both sides.

### 2.2 Kaneo public API surface available to an importer

| Operation | Endpoint |
| --- | --- |
| List workspaces | `GET /api/auth/organization/list` |
| Create project | `POST /api/project` (`name`, `workspaceId`, `icon`, `slug`) |
| List/create columns | `GET/POST /api/column/:projectId` (`isFinal` marks the done column) |
| Create task | `POST /api/task/:projectId` — `title`, `description`, `status` (column slug), `priority`, `startDate`, `dueDate`, `userId`, `draftAssetIds`, `customFields` |
| Bulk import (minimal fields) | `POST /api/task/import/:projectId` |
| Labels | `POST /api/label` (`name`, `color`, `workspaceId`, `taskId`) |
| Relations | `POST /api/task-relation` — `subtask`, `blocks`, `related` |
| Comments with attribution | `POST /api/comment/:taskId` — `externalUserName` + `externalSource`; **the enum already includes `"jira"`** |
| Staged image upload | `POST /api/task/draft-upload/:projectId` + `/finalize` (presigned S3, 24 h expiry, consumed via `draftAssetIds`) |
| Custom fields | `/api/custom-field` — types: number, boolean, date, dropdown, multiselect |
| Time entries | `POST /api/time-entry` — `taskId`, `startTime`, `endTime`, `description` |
| Members | `GET /api/workspace/:workspaceId/members` (email matching for assignees) |

### 2.3 Gaps that block a true 100% transfer today

1. **Attachments are images-only.** `apps/api/src/storage/s3.ts` whitelists image MIME types (jpeg/png/gif/webp/avif/heic/apng), surfaces are `description` | `comment`, default cap 10 MiB. PDFs, zips, office documents, videos — the majority of real Jira attachments — cannot be stored.
2. **No task history.** Jira changelogs have no Kaneo equivalent.
3. **No reporter / watcher / voter fields.** Only one assignee exists.
4. **No control over created timestamps.** Tasks and comments get Kaneo server time; original Jira timestamps must be recorded in the content/appendix.
5. **No bulk comment endpoint.** Comments are created one by one (acceptable, but the importer must be rate-limit aware).

## 3. Jira source capabilities

- **Targets:** Jira Cloud (REST API v3) and Jira Data Center/Server (REST API v2). v1 scope is Cloud; v2 support is a stretch milestone (M6).
- **Auth:** Cloud — email + API token (HTTP Basic), optionally OAuth 2.0 (3LO) later. Data Center — personal access token (Bearer). Credentials only via flags, prompts, or environment variables (`JIRA_API_TOKEN`, `JIRA_EMAIL`, `JIRA_URL`); never logged, never written into reports.
- **Entities read:**
  - Projects (`GET /rest/api/3/project`), issue types, statuses, priorities, custom field metadata (`GET /rest/api/3/field`).
  - Issues via paginated search (`POST /rest/api/3/search/jql` — the newer paginated endpoint, falling back to `GET /rest/api/3/search`), `fields=*all`, `properties=*all`, `expand=changelog,transitions`.
  - Comments, worklogs, and attachments come embedded in the issue payload; users via `GET /rest/api/3/user/search`.
  - Attachments are downloaded from each attachment object's `content` URI with the same credentials.
  - Sprints arrive as custom fields (GreenHopper `customfield_...` — resolved dynamically from field metadata, never hard-coded IDs).
- **Description format:** Jira descriptions and comments are Atlassian Document Format (ADF). The importer needs an ADF → Markdown converter scoped to the node types that occur in practice: paragraphs, headings, all list types (nested), code blocks, blockquotes, tables, panels/notes, media (inline images!), links, mentions, dates, status lozenges, emojis, horizontal rules. Unknown node types fall back to a best-effort text extraction plus a visible note — never a crash, never silent loss.
- **Pagination & rate limits:** honor `nextPageToken` / `maxResults`; on HTTP 429/503 obey `Retry-After` with exponential backoff and jitter; cap concurrent requests (default 4).

## 4. Filtering

The CLI applies status presets by translating them into JQL, then AND-combines every filter with any user-provided JQL:

| Flag | JQL clause |
| --- | --- |
| `--status open` | `statusCategory = "To Do"` |
| `--status in-progress` | `statusCategory = "In Progress"` |
| `--status closed` | `statusCategory = "Done"` |
| `--status all` (default) | — |
| `--project KEY` (repeatable) | `project = KEY` |
| `--type Bug` (repeatable) | `issuetype = Bug` |
| `--label x` | `labels = x` |
| `--assignee a@b.c` | `assignee = "a@b.c"` |
| `--updated-after 2026-01-01` | `updated >= 2026-01-01` |
| `--jql '<raw>'` | appended as-is, AND-combined |

- Presets exist so "closed / open / …" is one flag; raw JQL remains the escape hatch for anything else.
- Invalid projects/types produce an error listing what is available, matching the planka-import UX.
- A preview (dry-run) prints exactly what would be imported, including the resolved JQL.

## 5. Field mapping — the 100% coverage ledger

Every Jira value lands in exactly one of five destinations. The importer applies a strict rule: any field it has no explicit mapping for is serialized into the description appendix automatically, so nothing can be dropped silently.

| Jira | Kaneo destination |
| --- | --- |
| Project | Project (per Jira project; optionally map several projects into one via `--project` + `--single-project`) |
| Issue key (ABC-123) | Prefix in title (`[ABC-123] ...`) + appendix + report mapping |
| Summary | Task title |
| Description (ADF) | Task description (Markdown) |
| Status | Column — one Kaneo column per Jira status, created in workflow order; `isFinal` set on the final column of the Done category. Tasks land in their status column, so "closed" issues visibly sit in a closed column |
| Priority | Kaneo priority via mapping table (default: Highest→urgent, High→high, Medium→medium, Low→low, Lowest→no-priority), overridable with `--priority-map` |
| Issue type | Label `type:<name>` (lowercased); subtask issues become native subtask relations |
| Labels | Labels, colors derived from a stable hash of the name |
| Components, fix/affects versions | Labels `component:x`, `version:x` (or custom fields via `--components-as-custom-fields`) |
| Assignee | Workspace member matched by email (like planka-import); unmatched assignees recorded in appendix |
| Reporter | Appendix (Kaneo has no reporter field) |
| Created / updated / resolved dates | Appendix + `startDate` (created) / `dueDate` where Jira has a due date |
| Due date | `dueDate` |
| Story points, estimate, remaining | Custom fields (number) auto-created by the importer, typed via Jira field metadata |
| Sprint (name, state, goal) | Custom field (dropdown) + label `sprint:<name>`; active sprint surfaced in appendix |
| Epic link / parent | Task relation `subtask` (parent → child); epics themselves imported as tasks with label `epic` (alternative: `--epics-as-projects`) |
| Issue links (blocks, relates to, duplicates, causes, clones, …) | `task-relation` — blocks/is-blocked-by → `blocks` (direction normalized); subtask links → `subtask`; everything else → `related`; exotic types additionally noted in the appendix |
| Comments | Kaneo comments with `externalUserName` + `externalSource: "jira"`, original date and author prefixed in the text (requires the API key owner to hold `workspace:manage_settings`) |
| Comment attachments | Uploaded, embedded as Markdown images/files in the comment |
| Attachments (images) | Phase A: staged upload → `draftAssetIds` / embedded in description. Phase B: native task attachments |
| Attachments (files) | Phase B: native task attachments. Until Phase B ships: downloaded into a local bundle (`--attachments-dir`), sha256 recorded, metadata block appended to the description |
| Worklogs | Time entries (`startTime`, `endTime`, description incl. author and date) |
| Watchers, votes | Appendix (counts + users) |
| Changelog (history) | Default: full JSON changelog stored as a generated `-history.json` attachment/appendix link + summary comment. Optional `--history-as-comments` renders transitions as dated comments |
| Environment, security level, flags, SLAs, arbitrary custom fields | Appendix (generic serializer) or auto-created Kaneo custom fields when the type fits (number/boolean/date/dropdown/multiselect) |
| Project / user avatars | Downloaded and stored (project background where supported; otherwise in the appendix) |

## 6. Attachments: images and files

Phase A — images, using what exists today:

1. Filter attachments by the existing image MIME whitelist and 10 MiB cap.
2. `POST /api/task/draft-upload/:projectId` → upload bytes to the presigned URL → `/finalize` → pass `draftAssetIds` when creating the task, or reference the returned asset in description/comment Markdown (surface `comment` for comment images).

Phase B — generic files, required for the stated goal. Kaneo-side changes, to be proposed and merged before the importer relies on them:

| Change | Where |
| --- | --- |
| New table `task_attachment` (id, taskId, workspaceId, storageKey, filename, contentType, size, sha256?, uploadedBy, createdAt, externalSource) | drizzle migration in `apps/api/drizzle` |
| Storage: replace the image-only whitelist with a configurable allowlist (`KANEO_ALLOWED_ATTACHMENT_TYPES`, default images + pdf, txt, csv, zip, office docs, video), configurable size cap | `apps/api/src/storage/s3.ts` |
| Routes: presign + finalize + list + delete under `/api/task/:taskId/attachments`, OpenAPI schemas, workspace permission checks (`task:update`) | `apps/api/src/task` |
| Web UI: attachment list on the task detail, upload control, download links (private, presigned GETs) | `apps/web` |
| Cleanup: register attachment keys with the existing cleanup queue | `apps/api/src/storage/cleanup-*` |
| Docs + i18n strings | `apps/docs`, `i18n/` |

Importer behavior when Phase B is available: download each attachment from Jira once, stream into presigned storage, record filename/MIME/size/sha256, and attach. Oversized files (beyond the cap) fall back to the local-bundle + appendix route, with a loud warning in the reconciliation report.

## 7. Package design: `packages/jira-import`

One responsibility per file, tests beside every module (repo rules from AGENTS.md):

```
packages/jira-import/
  src/
    args.ts            # flags, prompts, JQL composition, validation
    jira.ts            # JiraClient: auth, search (+pagination), metadata, attachment download
    adf.ts             # ADF → Markdown converter (own module, heavily fixture-tested)
    kaneo.ts           # KaneoClient: reuse the planka-import client surface + custom fields,
                       #   time entries, attachments; keep the same error reporting
    mapping.ts         # Jira → Kaneo field mapping tables, priority/status/link maps
    appendix.ts        # generic serializer for unmapped fields ("Imported from Jira" block)
    migrate.ts         # orchestration: project loop, per-issue pipeline, resume, reports
    report.ts          # report types + reconciliation counts
    keys.ts, colors.ts # id/label keying and label color derivation (mirror planka-import)
    *.test.ts          # vitest beside every module
  package.json         # @kaneo/jira-import, bin "kaneo-jira-import", dependencies: prompts only
```

Execution model:

1. Authenticate, read metadata (fields, statuses, priorities, users), print plan (dry-run default in interactive mode).
2. Per selected Jira project: create Kaneo project, columns (one per status, in workflow order, done-category final column flagged), labels, custom field definitions.
3. Per issue (respecting filters): create task → append appendix → comments → worklogs → time entries → attachments → relations (second pass once sibling tasks exist, keyed via the report's `jiraKey → kaneoTaskId` map).
4. Resume: a JSON report (`--report path`) records the mapping; re-runs skip already-imported issue keys, so a failed run is continued rather than duplicated.
5. Reconciliation: source vs. imported counts for issues, comments, attachments (images/files), worklogs, links, custom fields; every mismatch listed; non-zero exit code when coverage < 100% unless explicitly waived.

## 8. Required Kaneo changes (Phase B checklist)

- [ ] drizzle migration: `task_attachment` table + FK indexes
- [ ] storage allowlist + size cap configuration
- [ ] attachment routes + OpenAPI + permission middleware
- [ ] cleanup-queue integration (orphaned uploads)
- [ ] `apps/web` task-detail attachment list + upload/download
- [ ] docs page, i18n strings, `apps/docs` update
- [ ] vitest unit + integration + storage tests

## 9. Milestones

| Milestone | Scope | Acceptance criteria |
| --- | --- | --- |
| M1 — Scaffold + read path | Package skeleton, auth (Cloud), metadata + paginated JQL search, filters, dry-run report | Dry-run prints correct issue counts/statuses for a real instance; unit tests for args/JQL composition |
| M2 — Core write path | Projects, columns, tasks (title/description/priority/status/dates/assignee), labels, appendix serializer, ADF converter | Issues import with correct column placement; ADF fixture suite green; reconcile: issues 100% |
| M3 — Conversation & structure | Comments (with attribution), relations (second pass), custom fields, worklogs → time entries, epics/subtasks | Reconcile: comments, links, worklogs 100%; dry-run + resume verified on 10k-issue synthetic project |
| M4 — Images | Phase A attachment pipeline (staged uploads, embedded Markdown) | Images render in Kaneo descriptions/comments; oversized/mismatched types correctly reported |
| M5 — Files (Kaneo extension + importer) | Phase B checklist + generic attachment transfer, avatars, changelog history | Any file type stored and downloadable in Kaneo; full reconciliation green on a mixed-attachment project |
| M6 — Hardening | Data Center/Server (API v2) support, OAuth 3LO, history-as-comments option, docs site page, npm publish | End-to-end documented run against both Cloud and a DC instance |

## 10. Testing strategy

- Unit: mapping tables, ADF fixtures (tables, nested lists, media, mentions, unknown nodes), appendix serializer, JQL composition, key/color derivation.
- Orchestration: `migrate.ts` tests against mocked clients, following the planka-import `migrate.test.ts` pattern; resume/idempotency scenarios; rate-limit backoff simulation.
- Storage: Phase B tests extend the existing `vitest.storage.config.ts` suite.
- Integration: docker-compose Postgres + S3-compatible storage; full import of a synthetic project (script generates issues of every type).
- Verification: the reconciliation report is the acceptance artifact — counts must match exactly before any milestone is called done.

## 11. Security & privacy

- Jira credentials and the Kaneo API key are read from flags, prompts, or env vars; masked in all output; never persisted in reports.
- The importer never logs issue content; progress output is counts only (repo rule: never leak private workspace data through responses, logs, events).
- All storage keys stay within the workspace-scoped prefix conventions of `storage/s3.ts`; attachments remain private, served by presigned GETs only.
- Import runs as a workspace member with least privilege: task/comment create, custom field, and time entry permissions.

## 12. Risks

| Risk | Mitigation |
| --- | --- |
| ADF complexity (panels, macros, exotic nodes) | Fixture-driven converter + best-effort fallback with visible note; nothing silently lost |
| Atlassian rate limits on large instances | `nextPageToken` pagination, concurrency cap 4, Retry-After backoff, resumable reports |
| Kaneo image-only storage until Phase B | Phase A covers images; files staged locally first, Phase B completes the 100% claim |
| Assignee email mismatches | Report lists unmatched users; appendix preserves original names (same UX as planka-import) |
| Many Jira statuses → column explosion | Configurable `--status-map file` to merge statuses into fewer columns; default keeps 1:1 |
| Server/DC API drift (v2) | Isolated in `jira.ts` behind the same client interface; M6 scope |
| Comment attribution requires `workspace:manage_settings` | Documented precondition; fallback drops `externalUserName` with a warning |

## 13. Open decisions

1. Cloud only for v1, or is Data Center/Server needed immediately? (Plan assumes Cloud first.)
2. Confirm Phase B (generic file attachments in Kaneo) is in scope for this initiative — it is a prerequisite for the stated 100% goal.
3. Epics as tasks (default) or as separate Kaneo projects?
4. Should the changelog be a stored JSON attachment (default) or rendered as comments?

## Appendix A — Status mapping

| Jira statusCategory | Preset filter | Kaneo |
| --- | --- | --- |
| To Do | `--status open` | Column(s) before the first in-progress column |
| In Progress | `--status in-progress` | Middle column(s) |
| Done | `--status closed` | Column with `isFinal: true` |

## Appendix B — Issue link mapping

| Jira link type | Kaneo relationType |
| --- | --- |
| Blocks / is blocked by | `blocks` (direction normalized) |
| Relates to, duplicates, causes, clones, … | `related` |
| Parent / child, Epic link | `subtask` |
| Any unmapped type | `related` + appendix note |
