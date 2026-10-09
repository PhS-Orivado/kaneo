# Gap Analysis: Task Type Attributes in Kaneo

Repository: `PhS-Orivado/kaneo` (pnpm monorepo: `apps/api`, `apps/web`, `packages/*`)
Analysis date: 2026-10-09

## 1. Purpose

This document identifies the gaps between the current Kaneo task model and the requested capability: distinguishable task attributes (task, bug, doc, and similar) that workspace members can define and manage at the workspace level, rendered with configurable symbols and colors (symbol color and font color).

## 2. Current State (As-Is)

### 2.1 Task data model (`apps/api/src/database/schema.ts`, `taskTable`)

A task carries the following distinguishing properties:

| Property | Implementation | Notes |
|---|---|---|
| Title and description | `title`, `description` | Description supports rich pages and attachments |
| Status / column | `status` (column slug), `columnId` | Columns are project-scoped and carry `icon` and `color` |
| Priority | `priority` | Fixed enum: `no-priority`, `low`, `medium`, `high`, `urgent` |
| Assignee | `userId` | Single assignee |
| Dates | `startDate`, `dueDate` | Used by calendar, Gantt, reminders |
| Labels | `labelTable` | Workspace-level definitions plus per-task copies |
| Custom fields | `custom_field_definition` / `custom_field_value` | Project-scoped definitions (text, number, date, dropdown, boolean, multiselect) |
| Relations | `task_relation` | Blocks, relates, duplicates |

There is no field that classifies the nature of the work item itself. A bug, a documentation task, and a regular feature task are structurally identical. The only classification axis users have today is labels, which are free-form, multi-valued, and not intended to express work-item taxonomy.

### 2.2 Labels as the nearest existing mechanism

- Workspace-level labels (name plus one of nine fixed palette colors) are created inline from the task labels popover (`task-labels-popover.tsx`) or attached to tasks.
- Labels are multi-valued by design, carry no symbol, and carry no separate font color.
- Permissions exist (`canCreateLabels`, `canUpdateLabels` via `useWorkspacePermission`), which establishes a precedent for attribute management permissions.

### 2.3 API and query surface

- `apps/api/src/task/schema.ts`: `listTasksQuery` supports filtering by `status`, `priority`, `assigneeId`, due-date bounds, sorting, and pagination. There is no attribute or type filter.
- `createTaskBody` and `updateTaskBody` carry no type information.
- `bulkUpdateBody` supports status, priority, assignee, labels, due date, and delete. There is no attribute operation.
- The OpenAPI surface (`openapi.ts`, `auth-openapi.ts`) and the MCP package (`packages/mcp`) expose tasks without any type concept.
- Search (`apps/api/src/search`) and calendar feeds have no type dimension.
- Importers (`packages/jira-import`, `packages/planka-import`) flatten external issue types into generic tasks.

### 2.4 Frontend

- Task property affordances are implemented as popovers (`task-priority-popover`, `task-status-popover`, `task-labels-popover`, `task-assignee-popover`, date popovers) and a properties sidebar (`task-properties-sidebar.tsx`). No type popover exists.
- Views that would need to render a type indicator: kanban board, list view, backlog, calendar, Gantt, my-tasks, inbox, search results, and public project views.
- Workspace settings (`apps/web/src/components/settings`) contain sections for API keys, members, roles, and similar; there is no section for task taxonomy.

## 3. Desired State (To-Be)

1. Workspaces can define an ordered set of task attributes (for example Task, Bug, Doc, Feature, Story).
2. Each attribute carries a name, a symbol (icon), a symbol color, and a font color.
3. A task references exactly one attribute; a workspace default applies when none is chosen.
4. Attributes are visible and selectable wherever a task is created, edited, displayed, filtered, or exported.
5. Attribute management is permission-gated and exposed through the REST API and MCP.
6. External issue types (Jira, Planka imports) map onto workspace attributes.

## 4. Gap Assessment

| # | Capability | Current | Gap | Severity |
|---|---|---|---|---|
| G1 | Task attribute field on task entity | Absent | New column plus FK with defined null behavior | Critical |
| G2 | Workspace-scoped attribute definitions with CRUD | Absent | New table, module, and endpoints | Critical |
| G3 | Attribute symbols (icons) | Absent for task classification; columns and projects have icons | Icon selection on attribute definitions, reuse of the existing lucide icon system | High |
| G4 | Symbol color and font color | Labels have a single color; no per-element font color | Two color properties per attribute with theme-safe palette tokens | High |
| G5 | Workspace settings UI for attribute management | Absent | New settings section with list, create, edit, reorder, delete | High |
| G6 | Task-level selection and display (popovers, sidebar, cards, rows) | Absent | New attribute popover and renderers in all task surfaces | High |
| G7 | Default attribute per workspace | Absent | Default flag and fallback logic on task creation | Medium |
| G8 | Filtering, sorting, and search by attribute | Absent | Query, search index, and filter UI extensions | Medium |
| G9 | Bulk update of attribute | Absent | New bulk operation | Medium |
| G10 | Permissions for attribute management and per-task assignment | Label permissions exist as a pattern | New permission keys in `packages/permissions` and workspace role wiring | Medium |
| G11 | REST API and OpenAPI exposure | Absent | New schema and route registration | High |
| G12 | MCP exposure | Absent | New tools and task payload fields in `packages/mcp` | Medium |
| G13 | Importer mapping (Jira, Planka) | Types discarded | Mapping strategy with fallback to default attribute | Low |
| G14 | Activity log entries for attribute changes | Activity table exists | New activity type | Low |
| G15 | i18n strings | Framework in place | New translation keys | Low |
| G16 | Tests and migration tooling | Established patterns exist | Schema migration, unit tests, e2e coverage | Medium |

## 5. Key Risks

1. Ambiguity between attributes, labels, and custom fields must be resolved in the product model, otherwise users receive three overlapping classification mechanisms.
2. Deletion semantics: an attribute referenced by many tasks must not corrupt history. A deletion lock pattern already exists for labels and should be evaluated for reuse.
3. Performance: board queries fetch many tasks at once; the attribute must be joined efficiently and cached on the web side.
4. Dark and light themes: free-form hex colors may produce inaccessible contrast; a curated palette (as used for labels) is safer than an unrestricted color picker.

## 6. Out of Scope

- Multiple attributes per task (the analysis assumes a single, mutually exclusive attribute per task, consistent with mainstream trackers).
- Per-project attribute overrides (workspace scope only, per the request).
- Epics and hierarchical work-item structures beyond the existing subtask and relation features.
