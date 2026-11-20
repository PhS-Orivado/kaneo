# Branching plan: PRs from `develop` to `usekaneo/kaneo/main`

Status: planning document only — no code changes. All branches are cut from
`base-upstream` (local name for `usekaneo/main`, currently `fb8b0b49`).

## Why the diff is large

`develop` and `usekaneo/main` diverged at merge-base `265f1fd5`:

- `develop` has **407 commits** that upstream `main` does not have
  (~436 files, +52.7k / -5.7k lines).
- upstream `main` has **56 commits** the fork does not have (time tracking,
  subtask display toggle, parent-task fixes, security bumps, the mellon app,
  calendar/parent-deadline work, ...). These stay on `base-upstream` and are
  re-synced separately; they are not part of the feature PRs below.

Most of the 407 fork commits are merge/chore noise (fork syncs to upstream
v2.42.0/v2.48.0, "Restore fork customizations" batches, locale restoration,
conflict-resolution batches). The actual feature work falls into the
categories below.

## Change categories and branch mapping

| # | Category | Branch (from `base-upstream`) | Contents |
|---|----------|-------------------------------|----------|
| 1 | Multi-repo integrations | `multi-repo` (existing) | RFC 0001 (`rfc/0001-multiple-repositories-per-project.md`) work packages WP0–WP10: repository-scoped integration schema + migrations (0064, 0066/0075 multi-repo integrations), re-keying GitHub/Gitea/GitLab integrations and integration-sync routes by repository binding / integration id, `workspaceAccess.fromIntegration` middleware, plan-based binding quotas, web UI for multi-repository bindings, compat shims, db idempotency fixes for migration 0066 |
| 2 | Sprint planning | `sprint-planning` (existing) | Sprint schema/module/migrations (0064 sprint planning, 0065/0074 carry-over), sprint CRUD/start/close/reorder/task-assignment controllers + tests, MCP sprint tools, web sprint planning UI, board scoped to a selectable sprint, sprint overview with drag-and-drop and multi-select, sprint banner, closed-sprint column fix, 409 mapping for sprint unique-constraint races, e2e + unit tests, `docs/sprints/` |
| 3 | Import improvements | `import-improvement` (existing) | Jira importer: read sprints/attachments/board id, write imported sprints and keep tasks in them, carry sprint goal, copy attachments into S3, persist source references (labels, urls, comment ids), rewrite Jira links to internal task links (API + web settings UI), staged import progress UI with sprint/attachment counts, dead-module build fix, importer tests/docs |
| 4 | Instance branding (white-label) | `instance-branding` (new) | `feat(branding)` stack: branding in public config schema, admin GET/PUT branding routes + settings page, white-label applied in root/title/logo/footer, startup migration, OpenAPI regeneration, settings navigation entry, branding guard fix (`requireInstancePermission`) |
| 5 | Admin instance config (SMTP/S3) | `admin-instance-config` (new) | Instance SMTP and S3 configuration API, admin email/storage settings page, test-email delivery detail reporting (API + web toast) |
| 6 | Web proxy / split deployment | `web-proxy-deploy` (new) | `proxy /api/` to the API service in split deployments; resolve proxy target at request time to prevent stale 502s |
| 7 | CI / images | `ci-images` (new) | Manual-dispatch workflows to build/push selected container images, local build-and-push script to ghcr.io, sentry removal from the local build script, related docs |
| 8 | Task type (task/bug) | `task-type-badge` (new) | Task type in creation modal and properties sidebar; non-interactive type badge with a11y label |

### Notes

- **Dependencies:** `import-improvement` builds on sprint import, so it
  depends on `sprint-planning`. `multi-repo` is the schema foundation and is
  independent. Branding, admin config, proxy, CI, and task-type are
  independent of everything else.
- **Suggested PR order:** `multi-repo` → `sprint-planning` →
  `import-improvement` → `instance-branding` → `admin-instance-config` →
  `web-proxy-deploy` → `ci-images` → `task-type-badge`. Merge each into
  `usekaneo/main` (via PR) and rebase the remaining branches onto the updated
  `base-upstream` before opening the next PR.
- **i18n:** the fork carries restored/completed locale files (zh-CN, fr-FR,
  de-DE, ...). Ship each feature's new keys inside its own branch PR rather
  than one giant locale PR; only the large pre-existing locale restoration
  (if still missing upstream) goes as a separate `i18n-locales` branch if
  needed.
- **Migration hygiene:** db fixes (journal registration, 0073–0075 backdated
  timestamps, 0066 idempotency) travel with their owning feature branch
  (`multi-repo`, `sprint-planning`), not as a standalone PR.
- **Out of scope for these PRs:** fork-sync merge commits, "Restore fork
  customizations" batches, conflict-resolution batches, and the 56 upstream
  commits listed above.

## Branch inventory (all at `fb8b0b49` = `usekaneo/main`)

```
Each feature branch carries its changes as 2-3 commits on top of
`base-upstream` (`fb8b0b49`), grouped as api/packages, web/i18n, tests/docs.
The split was produced by scoping the `base-upstream..develop` diff per
feature (whole files by path, shared files such as `schema.ts`, the drizzle
journal, `openapi.json` and `i18n/*.json` per diff hunk by keyword), because
the raw fork history interleaves upstream syncs and does not cherry-pick
cleanly onto `usekaneo/main`.

```
base-upstream          fb8b0b49  tracks usekaneo/main
multi-repo             +3 commits, 162 files  category 1
sprint-planning        +3 commits, 181 files  category 2
import-improvement     +3 commits,  68 files  category 3
instance-branding      +2 commits,  42 files  category 4
admin-instance-config  +3 commits,  69 files  category 5
web-proxy-deploy       +3 commits,  10 files  category 6
ci-images              +3 commits,  13 files  category 7
task-type-badge        +2 commits,   6 files  category 8
```

Note: drizzle meta snapshots are whole-file per category, so a snapshot may
mention tables owned by another feature; the actual schema/module code is
split correctly. `pnpm-lock.yaml` and fork-vs-upstream drift (calendar,
time-tracking, mellon, generic workflows, README/CHANGELOG) are deliberately
excluded from all branches.

## Check results (per branch, after fixup commits)

- `pnpm lint`: **passes** on multi-repo, instance-branding, task-type-badge,
  admin-instance-config, web-proxy-deploy, ci-images. sprint-planning and
  import-improvement each have only errors that also exist on `develop`
  (a11y in sprint-task-row.tsx / sprints-list-view.tsx, label a11y in
  import-options-card.tsx).
- `pnpm test` (unit): all branches at parity with `develop` (which itself has
  pre-existing failures, e.g. `source.test.ts` "reads the board, pages
  issues" and several multi-repo integration tests failing with
  `database.select is not a function` in test mocks).
- `pnpm typecheck`: `develop` itself has ~80 pre-existing errors, so branches
  are not fully green standalone; each branch was fixed up until its
  remaining errors match the develop baseline plus unavoidable shared-file
  coupling (schema/migrations are kept atomic per branch to stay consistent).
