# Requirements Document: Workspace Task Attributes

Project: Kaneo (`PhS-Orivado/kaneo`)
Basis: Gap analysis in this directory.
Version: 1.0, 2026-10-09

## 1. Introduction

### 1.1 Purpose

This document specifies the requirements for task attributes: a workspace-level classification of tasks by their nature, such as task, bug, or doc. Each attribute is visually expressed through a configurable symbol and two configurable colors: one applied to the symbol and one applied to the attribute text.

### 1.2 Scope

In scope: attribute definition and management at the workspace level; task association with exactly one attribute; visual rendering across all task surfaces; filtering, sorting, search, and bulk operations; permission gating; REST API, OpenAPI, and MCP exposure; importer mapping.

Out of scope: multiple attributes per task; per-project attribute overrides; new hierarchies beyond existing subtasks and relations.

### 1.3 Definitions

- Task attribute: a workspace-scoped definition describing the nature of a task (for example Task, Bug, Doc).
- Symbol: a vector icon from the existing icon library rendered next to the attribute.
- Symbol color: the color applied to the symbol.
- Font color: the color applied to the attribute name wherever it is rendered as text.

### 1.4 Personas

- Workspace administrator: defines, edits, reorders, and deletes attributes; assigns permissions.
- Workspace member: selects an attribute when creating or editing tasks; views and filters by attribute.
- Read-only member or public project viewer: sees attribute symbols and colors on all rendered tasks.
- API or MCP consumer: reads and writes attribute data programmatically.

## 2. Functional Requirements

Priorities use MoSCoW. Each requirement has a unique identifier referenced by the feature description and the implementation plan.

### 2.1 Attribute definition

| ID | Requirement | Priority |
|---|---|---|
| FR-01 | The system shall store task attributes scoped to a workspace, each with a unique name within that workspace (case-insensitive). | Must |
| FR-02 | Each attribute shall carry a name, a symbol identifier, a symbol color, a font color, and a position for ordering. | Must |
| FR-03 | Each attribute may carry an optional description for internal documentation. | Could |
| FR-04 | Exactly one attribute per workspace shall be flagged as the default; it is applied to newly created tasks when no attribute is specified. | Must |
| FR-05 | New workspaces shall be seeded with the attributes Task, Bug, and Doc, each with a predefined symbol and colors, editable thereafter. | Must |
| FR-06 | The system shall provide create, read, update, and delete operations for attributes, with deletion permitted only when no task references the attribute, or only after explicit confirmation and migration of affected tasks to the default attribute. | Must |
| FR-07 | Reordering attributes shall persist the order and be reflected in every selector and settings list. | Should |
| FR-08 | Names shall be limited to 64 characters; symbols shall be restricted to identifiers available in the frontend icon library; colors shall be restricted to the curated palette tokens used by the label system. | Must |

### 2.2 Task association

| ID | Requirement | Priority |
|---|---|---|
| FR-09 | Each task shall reference zero or one attribute. A null reference shall render without an attribute indicator. | Must |
| FR-10 | Task creation shall accept an optional attribute identifier; when omitted, the workspace default applies. | Must |
| FR-11 | Task update shall accept an attribute change, validated against the task workspace. | Must |
| FR-12 | Moving or duplicating a task shall preserve its attribute. | Must |
| FR-13 | Changing an attribute shall record an activity log entry of the established type. | Should |
| FR-14 | Bulk operations shall include an update-attribute operation. | Should |

### 2.3 Visualization

| ID | Requirement | Priority |
|---|---|---|
| FR-15 | Every surface that renders a task (board card, list row, backlog, calendar, Gantt, my-tasks, inbox, search results, public project views, task detail) shall render the attribute symbol with its symbol color. | Must |
| FR-16 | Wherever the attribute name is rendered as text, the configured font color shall be applied. | Must |
| FR-17 | Colors and symbols shall satisfy accessibility contrast requirements in light and dark themes. | Must |
| FR-18 | The task detail sidebar shall expose an attribute selector popover consistent with the existing priority and label popovers. | Must |
| FR-19 | The quick task creation affordances on the board and in the command palette shall offer an attribute selector. | Should |

### 2.4 Filtering and search

| ID | Requirement | Priority |
|---|---|---|
| FR-20 | Task list queries shall support filtering by one attribute identifier or by an explicit no-attribute condition. | Must |
| FR-21 | Board, list, backlog, and my-tasks filter UIs shall expose an attribute facet. | Must |
| FR-22 | Global search shall match attribute names and allow filtering results by attribute. | Should |
| FR-23 | Sorting by attribute position shall be available in sortable views. | Could |

### 2.5 Permissions and administration

| ID | Requirement | Priority |
|---|---|---|
| FR-24 | Attribute create, update, and delete operations shall require a dedicated workspace permission, distinct from label permissions. | Must |
| FR-25 | Assigning or changing an attribute on a task shall be governed by the task update permission. | Must |
| FR-26 | Workspace settings shall include a Task Attributes section available to members holding the attribute management permission. | Must |
| FR-27 | Custom workspace roles shall be able to include or exclude the attribute management permission. | Should |

### 2.6 Integration

| ID | Requirement | Priority |
|---|---|---|
| FR-28 | The REST API shall expose attribute CRUD, workspace listing, task create and update with attribute, and filtering by attribute, documented in OpenAPI. | Must |
| FR-29 | The MCP server shall expose attribute listing and task attribute read and write. | Should |
| FR-30 | The Jira and Planka importers shall map source issue types onto workspace attributes, creating attributes when the mapping configuration requests it and falling back to the default attribute otherwise. | Could |

## 3. Non-Functional Requirements

| ID | Requirement |
|---|---|
| NFR-01 | Board and list queries including attribute data shall not measurably regress existing load times; attribute data shall be joinable and cacheable. |
| NFR-02 | All attribute mutations shall be recorded with consistent error semantics (403, 404, 409) matching the existing API conventions. |
| NFR-03 | The schema migration shall be backward compatible: existing tasks remain valid with a null attribute and are handled by a default-assignment backfill strategy. |
| NFR-04 | All user-facing strings shall be externalized to the existing i18n framework for all supported locales, with English as fallback. |
| NFR-05 | Attribute references shall not be stored as free text; referential integrity shall be enforced by the database. |
| NFR-06 | The feature shall be covered by unit tests (API and web), at least one integration test per endpoint, and e2e coverage of the definition and assignment flows. |

## 4. Data Requirements

1. A `task_attribute` table scoped by workspace with unique name, symbol, symbol color, font color, position, and default flag.
2. A nullable `attribute_id` foreign key column on `task` with defined null and delete behavior.
3. Backfill behavior: existing tasks receive the workspace default attribute during migration, or remain null with the default applied at render time; the implementation plan shall select one strategy.

## 5. Acceptance Criteria

1. A workspace administrator can create an attribute named Doc with a chosen symbol, symbol color, and font color, and it appears on all task surfaces with those visuals.
2. A member can create a Bug task without selecting an attribute and receive the workspace default.
3. Filtering the board by Bug shows only tasks with the Bug attribute.
4. A member without the attribute management permission cannot modify definitions but can still assign existing attributes to tasks.
5. Deleting a referenced attribute is blocked or safely migrated, and no task loses data integrity.
6. The REST API and MCP expose the complete attribute lifecycle, and the OpenAPI schema validates.

## 6. Open Questions

1. Should attribute deletion migrate affected tasks to the default attribute, or should deletion be blocked while references exist? (Recommendation: block by default, allow forced deletion with explicit migration.)
2. Should the default attribute apply at render time for legacy tasks, or should the migration backfill the column once? (Recommendation: render-time fallback, no backfill, preserving null as a meaningful state.)
3. Should the font color palette be identical to the symbol color palette, or expanded? (Recommendation: identical curated palette, theme-aware tokens.)
