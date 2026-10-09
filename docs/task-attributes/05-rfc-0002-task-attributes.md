# RFC 0002: Workspace Task Attributes

Status: accepted
Date: 2026-10-09
References: docs/task-attributes/ (gap analysis, requirements, feature description, implementation plan)

## Context

Tasks currently carry a status (column), a priority, labels, and project-scoped custom fields, but no field that expresses the nature of the work (task, bug, doc, and similar). The four planning documents in this directory specify a workspace-scoped task attribute with a symbol, a symbol color, and a font color.

## Decisions

1. Single attribute per task. `task.attribute_id` is a nullable foreign key to `task_attribute`. Unlike labels, no per-task copies are stored; referential integrity is enforced by the database. Null renders without an indicator.
2. Workspace scope. Attributes are defined per workspace; per-project overrides are a possible future extension and are explicitly out of scope.
3. Default semantics. At most one attribute per workspace is flagged `is_default`; the invariant is enforced transactionally by the service layer (no partial unique index is used). The default is applied only at creation time when the request omits `attributeId`. Legacy tasks are not backfilled; null stays a meaningful state.
4. Deletion semantics. Deleting an attribute referenced by any task returns HTTP 409 with the reference count. A forced deletion (`?force=true`) reassigns the referenced tasks to the workspace default and then deletes. The default attribute cannot be deleted.
5. Name uniqueness is case-insensitive, enforced by the expression unique index on `(workspace_id, lower(name))`, not only by service validation.
6. Palette and icon allow-lists. Colors are the nine existing label palette tokens (stone, slate, violet, emerald, green, amber, orange, rose, red), one for the symbol and one independently chosen for the text, resolved through theme-aware CSS variables. Icons are restricted to an append-only allow-list of lucide identifiers shared between the API validation constant and the web picker.
7. Permissions. Definition mutations require the new `taskAttribute` resource statements (create/update/delete) following the repository resource/action convention; viewing the list requires only workspace membership (mirroring labels); assigning an attribute on a task requires only the ordinary task update permission.
8. Seeding and rollout. The Drizzle journal migration (0063) creates the schema. A runtime data migration seeds Task (SquareCheckBig, slate), Bug (Bug, red), and Doc (FileText, emerald), with Task flagged as default, for every workspace that has no attributes, and backfills the `taskAttribute` statements into existing seeded workspace role rows that lack the key (preserving all other customizations). The migration is idempotent and recorded in `data_migration` under `task-attributes-v1`.

## Consequences

- The schema change is additive (new table, nullable column); no downtime is required.
- Future `drizzle-kit generate` runs must account for the hand-written 0063 SQL and the journal entry, following the established repo convention of hand-written migrations (0006, 0015, 0020, 0024, and others).
- The task integration (create/update/filter/bulk/activity), the MCP exposure, and the web UI land in the follow-up work packages WP4 to WP10 of the implementation plan.
