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
base-upstream          fb8b0b49  tracks usekaneo/main
multi-repo             fb8b0b49  category 1
sprint-planning        fb8b0b49  category 2
import-improvement     fb8b0b49  category 3
instance-branding      fb8b0b49  category 4  (new)
admin-instance-config  fb8b0b49  category 5  (new)
web-proxy-deploy       fb8b0b49  category 6  (new)
ci-images              fb8b0b49  category 7  (new)
task-type-badge        fb8b0b49  category 8  (new)
```
