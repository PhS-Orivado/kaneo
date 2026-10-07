# WP9 — Tests

RFC 0001, WP9, revised for the governing decisions. This document is the acceptance ledger for the whole plan: every PR lands its slice of the matrix; nothing is deferred to a final test PR. The quota-specific cases live in the WP10 matrix and are referenced here.

## 1. Existing suites to extend

- `tests/api-integration/integration-sync-settings.test.ts` — sync settings per binding (WP5)
- `tests/api-integration/integration-sync-rules.test.ts` — sync rules per binding (WP5)
- `tests/api-integration/pull-request-task-links.test.ts` — external link isolation across bindings (WP2)
- `tests/plugins/gitlab/webhook-handler.test.ts` — per-integration webhook with per-row secret (WP4)
- Migration tests — WP0 backfill and rollback guard
- Existing middleware suites — WP1 regression

## 2. Test matrix

Revisions against RFC WP9 are marked. Cases D1.1 to D1.3 replace the RFC's original cross-project 409 case, because sharing is allowed. Quota cases are owned by WP10.

| Case | Level | WP |
|---|---|---|
| Migration backfills repository_key for existing rows (all three providers, numeric and legacy GitHub keys) | migration test | WP0 |
| Partial unique index preserves one-row-per-project for non-git integrations | migration/database test | WP0 |
| Rollback guard passes before multi-binding and refuses after | migration test | WP0 |
| Link two GitHub repositories to one project; both webhooks create tasks with distinct links | api-integration | WP2 |
| Duplicate link to the same project returns 409 with code `repository_already_linked` | api-integration | WP2 |
| D1.1 Cross-project link of the same repository succeeds; no 409 is returned | api-integration | WP2/WP3/WP4 |
| D1.2 One repository event fans out to every bound project; each project's tasks carry their own binding's external links | api-integration | WP2 |
| D1.3 Cross-project bindings maintain independent sync rules, workflow rules, and import state | api-integration | WP5/WP6 |
| Concurrent create of the same repository in the same project: exactly one row survives; in different projects: both survive | api-integration | WP2/WP3/WP4 |
| Delete one binding: the other stays active; external links and import state of the deleted row cascade; tasks remain | api-integration | WP2/WP3/WP4 |
| `findAllIntegrationsByRepo` resolves via repository_key including legacy owner/name keys | unit | WP2 |
| Sync rules keyed by integrationId; preview, save, review, and resume per binding | api-integration | WP5 |
| Preview token not replayable against a sibling binding | api-integration | WP5 |
| Workflow rule resolution: repository-specific rule wins over the type-wide fallback; sibling falls back | unit | WP6 |
| NULL-aware upsert: type-wide and specific rules coexist for the same (project, type, event) | api-integration | WP6 |
| `fromIntegration` middleware: foreign-workspace integrationId yields 403 on every id-keyed route (one negative test per route) | api-integration | WP1–WP5 |
| Gitea webhook per integrationId with per-row secret (signature check per row) | api-integration | WP3 |
| GitLab webhook handler per integrationId with per-row secret | api-integration | WP4 |
| Webhook secret exposure limited to manage_settings callers per binding | api-integration | WP3/WP4 |
| Quota: at-limit create returns 402 with used/limit; deactivation frees quota; reactivation re-checked; mixed-provider counting; usage summary matches | api-integration | WP10 |
| Key derivation equivalence between SQL backfill and TypeScript helpers (Gitea normalization, GitLab paths) | unit | WP0/WP3/WP4 |
| Web settings list: render N bindings, add flow, disconnect confirmation, quota badge, cross-project note, states | component tests | WP7 |
| Unique violation mapping: same-project violation maps to 409; an unmapped constraint still surfaces as 500 | unit | WP2 |

## 3. Test infrastructure notes

- Concurrency cases (simultaneous creates) need a test harness that issues parallel requests against a real database; both same-project and cross-project variants are asserted (D1 changes the expected outcome: same-project leaves one row and one 409; cross-project leaves two rows and no error).
- Fan-out cases assert three things per event: task creation in every bound project, external links scoped per binding, and project-scoped task numbering with no collisions.
- Component tests cover the states table of WP7 (empty, loading, error, partial, limit reached, cross-project note) and keyboard and focus behavior.
- Migration tests run against a database seeded with single-repository rows for all three providers, including a legacy GitHub row without repositoryId and unnormalized Gitea base URLs.

## 4. Acceptance criteria

1. Every matrix row is green in CI before the corresponding PR merges; the matrix is duplicated into the PR description of each provider PR with its own rows checked.
2. No cross-project 409 case remains anywhere in the suite (D1); a grep for the old message "already linked to another project" returns nothing.
3. The fan-out and concurrency cases run against a real PostgreSQL instance, not mocks, because they exercise constraint behavior.
4. Coverage of every new route: one happy path, one 403 foreign-workspace path, one 404 path, and where applicable one 409 and one 402 path.
5. The WP10 quota matrix and the WP7 component matrix are tracked as sub-ledgers in their PRs and reconciled here at the end of the rollout.

## 5. Risks

| Risk | Mitigation |
|---|---|
| Suites green individually but flaky under parallel constraint tests | Concurrency cases use distinct repositories and projects per test; database-level assertions retry with a small bounded loop |
| Legacy-data migration tests miss real-world config shapes | Seed data is drawn from the config schemas of all three providers, including invalid JSON rows, which must not abort the backfill |
| Component tests drift from the actual API shapes | Zod schemas shared between fetcher and hook (WP7) are reused in the test mocks |