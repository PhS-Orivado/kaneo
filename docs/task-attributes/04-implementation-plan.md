# Implementation Plan: Workspace Task Attributes

Project: Kaneo (`PhS-Orivado/kaneo`)
Basis: Gap analysis, requirements document, and feature description in this directory.
Version: 1.0, 2026-10-09

## 1. Guiding Principles

1. Follow the established module structure: `schema.ts`, `controllers/`, `response.ts`, `index.ts` per API module, mirrored hooks and fetchers on the web side.
2. Reuse existing patterns: the label palette and color resolution, the deletion-lock pattern, the popover interaction model, and the permissions package.
3. Land the feature in reviewable work packages, each leaving the application green.
4. Prefer referential integrity over denormalized copies; unlike labels, the attribute is not duplicated per task.

## 2. Work Packages

### WP1: Decision record and schema (backend foundation)

Tasks:

1. Write a short RFC following the repository convention (comments reference RFC 0001) resolving the open questions: deletion semantics (block by default), null semantics (no backfill, creation-time default), palette reuse.
2. Add `task_attribute` table to `apps/api/src/database/schema.ts` with the columns from the feature description.
3. Add `attribute_id` column to `taskTable` with `on delete set null` and an index.
4. Add the migration in `apps/api/src/migrations` following the existing migration approach (for example the pattern in `column-migration.ts`), including the seed of Task, Bug, Doc for existing workspaces and the default-flag assignment.

Definition of done: migration applies cleanly on a populated database; existing tasks remain valid with null attributes.
Estimate: 1 day.

### WP2: Permissions package

Tasks:

1. Add `taskAttribute` resource statements to `packages/permissions` with tests.
2. Wire the permission into the workspace role defaults (admin and owner roles) and expose it in the workspace permission hooks used by the frontend (`useWorkspacePermission`).

Definition of done: role editing surfaces the new permission; unit tests pass.
Estimate: 0.5 day.

### WP3: API module `task-attribute`

Tasks:

1. Create `apps/api/src/task-attribute/`: Zod schemas with OpenAPI annotations (create, update, list, reorder, param schemas), controllers for the five endpoints, response serializer, and router registration.
2. Implement the deletion-lock check returning 409 with the reference count.
3. Implement the transactional single-default invariant.
4. Implement the icon allow-list constant shared with the web icon registry and the nine-token color validation.
5. Register routes in `openapi.ts`; extend the OpenAPI document.

Definition of done: endpoints behave per the feature description; integration tests cover create, duplicate name 409, invalid icon 400, invalid color 400, delete-blocked 409, default switching, and permission denial 403.
Estimate: 2 days.

### WP4: Task integration (backend)

Tasks:

1. Extend `createTaskBody`, `updateTaskBody`, and the create and update controllers in `apps/api/src/task` with `attributeId` validation against the workspace.
2. Extend the task response serializer to include the joined attribute.
3. Extend `listTasksQuery` with `attributeId` and attribute-none filters and `sortBy: attribute`; ensure board, list, backlog, calendar, and search queries propagate the join.
4. Add `updateAttribute` to `bulkUpdateBody` and its controller.
5. Preserve `attributeId` in task move and duplicate flows; implement name-based mapping on cross-workspace moves.
6. Add the `attribute-changed` activity type with previous and new names in the payload.

Definition of done: all task flows accept, persist, and return attributes; filters work on the list endpoint; activity entries appear; the full existing task test suite passes.
Estimate: 2 days.

### WP5: MCP and importers

Tasks:

1. Extend `packages/mcp` with the `list_task_attributes` tool and attribute fields on task tools and task payloads.
2. Jira importer: map issue types by name with a create-missing configuration flag and default fallback.
3. Planka importer: optional label or list-name mapping to attributes with default fallback.
4. Extend calendar feed and webhook payloads with the attribute name.

Definition of done: MCP tools validate against the OpenAPI schema; importers map types without data loss; existing importer tests pass and new mapping tests exist.
Estimate: 1.5 days.

### WP6: Web foundation (types, hooks, fetchers)

Tasks:

1. Add the `TaskAttribute` type in `apps/web/src/types` and extend the `Task` type.
2. Add query hooks (`use-get-task-attributes`) and mutation hooks (create, update, delete, reorder, set-on-task, bulk) following the existing hook structure, with cache key `["task-attributes", workspaceId]` and the established invalidation behavior for task queries.
3. Extend the task type guards and any shared mappers used by views.

Definition of done: hooks are consumed by a temporary smoke usage or unit test; the web build passes.
Estimate: 1 day.

### WP7: Web settings section

Tasks:

1. Add the Task Attributes entry to the settings nav (`build-settings-nav.ts` and related navigation and breadcrumb helpers, extending their tests).
2. Build the settings page: ordered list with live preview chips, create and edit dialog (name, icon grid picker, symbol color swatches, font color swatches, default toggle, preview), drag reorder, delete confirmation with reference count.
3. Gate the section behind the `taskAttribute: update` permission.

Definition of done: an administrator can manage the full attribute lifecycle in the UI; unit tests for the nav builders and the dialog validation exist.
Estimate: 2 days.

### WP8: Task-level UI

Tasks:

1. Build the shared `TaskAttributeBadge` component (symbol resolution, color token resolution, truncation, accessible label).
2. Build the `task-attribute-popover` following the priority popover interaction model, with the None option and search above eight attributes.
3. Mount the popover in the task properties sidebar and task details header; wire the update mutation and invalidations.
4. Integrate the badge and, where applicable, the popover into: kanban board card, list view rows, backlog rows, calendar chips, Gantt bars, my-tasks, inbox, search results, public project views, command palette, and quick-create composer with the default preselected.

Definition of done: every surface renders the attribute consistently; component tests exist for the badge and popover; visual verification in light and dark themes.
Estimate: 3 days.

### WP9: Filtering, search, and bulk operations UI

Tasks:

1. Add the attribute facet to board, list, backlog, and my-tasks filter UIs, sharing one facet component.
2. Extend the global search and command palette with attribute matching and filtering.
3. Extend the bulk-selection bar with the attribute update action.

Definition of done: filtering by attribute works across views; bulk attribute update works; facet states serialize into shareable view URLs where filters already do so.
Estimate: 1.5 days.

### WP10: i18n, tests, and documentation

Tasks:

1. Add all new user-facing strings to the i18n resources for the supported locales, with English fallback.
2. Add e2e coverage (Playwright, following the existing e2e structure): definition flow, assignment flow, filter flow.
3. Update the docs application (`apps/docs`) and the API reference pages with the attribute endpoints and task fields.
4. Add the release note entry.

Definition of done: CI green including lint, commit checks, unit, integration, and e2e suites; documentation renders.
Estimate: 1.5 days.

## 3. Sequencing and Milestones

Milestone 1 (backend complete): WP1 to WP5, approximately 7 days.
Milestone 2 (feature complete): WP6 to WP9, approximately 7.5 days.
Milestone 3 (release ready): WP10, approximately 1.5 days.

Total estimated effort: approximately 16 working days for one developer, or roughly 8 to 10 calendar days with two developers splitting backend and frontend tracks after WP1.

## 4. Migration and Rollout Strategy

1. The schema migration is additive: a new table and a nullable column. No downtime is required.
2. Existing workspaces receive the seed attributes (Task, Bug, Doc) with Task flagged as default. Existing tasks keep a null attribute and continue to render normally; the default applies to newly created tasks only.
3. The feature ships behind no feature flag; the additive nature and the null fallback keep the risk low. If desired, the settings section can be merged first and the task-level UI in a follow-up release.
4. The REST API changes are additive; versioned consumers see only new optional fields.

## 5. Testing Strategy

| Layer | Coverage |
|---|---|
| Unit (API) | Schema validation, default invariant, deletion lock, color and icon validation |
| Integration (API) | All five endpoints, task create, update, move, duplicate, filter, bulk, permission denials |
| Unit (web) | Badge and popover components, hooks, nav builders, dialog validation |
| E2E (Playwright) | Attribute definition flow, assignment flow, filter flow |
| Visual | Light and dark theme verification of all palette combinations on the badge |

## 6. Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Join cost on large board queries | Index on `attribute_id`; attribute list cached by React Query per workspace and joined client-side where simpler |
| Duplicate-name races | Case-insensitive unique index at the database level, not only service validation |
| Icon drift between frontend registry and backend allow-list | Single shared constant or generated list; append-only convention |
| Importer ambiguity | Mapping is opt-in configuration with default fallback; no silent type invention |
| Scope creep toward per-project attributes | The RFC explicitly records workspace scope; per-project overrides are a future extension |

## 7. Acceptance Checklist

1. Migration applies on a populated database without data loss.
2. New workspaces contain Task, Bug, Doc with Task as default.
3. Full attribute CRUD works from workspace settings, gated by the `taskAttribute` permission.
4. Attribute selection and display work on the board, list, backlog, calendar, Gantt, my-tasks, inbox, search, and public views.
5. Filtering and bulk update by attribute work.
6. Deleting a referenced attribute is blocked with a clear 409 and reference count.
7. Activity entries record attribute changes.
8. OpenAPI schema validates; MCP tools work end to end.
9. Importers map types with the configured fallback.
10. CI is green, including the new tests, and the documentation is updated.
