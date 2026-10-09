# Detailed Feature Description: Workspace Task Attributes

Project: Kaneo (`PhS-Orivado/kaneo`)
Basis: Gap analysis and requirements document in this directory.
Version: 1.0, 2026-10-09

## 1. Overview

Workspace Task Attributes introduce a first-class classification of the nature of a task. Every workspace manages an ordered set of attributes, seeded with Task, Bug, and Doc and freely extensible with additional attributes such as Feature, Story, Improvement, or Research. A task carries at most one attribute. The attribute is rendered everywhere the task appears, expressed through three visual properties: a symbol, a symbol color, and a font color.

The feature deliberately positions attributes as the taxonomy layer, distinct from the two existing classification mechanisms:

| Mechanism | Question answered | Cardinality | Scope |
|---|---|---|---|
| Attribute | What kind of work is this? | Exactly one per task | Workspace |
| Column (status) | Where is this in the workflow? | Exactly one | Project |
| Label | Which cross-cutting topics apply? | Many | Workspace |
| Custom field | What project-specific data is attached? | Many | Project |

## 2. Concept Model

An attribute definition consists of:

| Property | Type | Constraints | Example |
|---|---|---|---|
| Name | text | Unique per workspace, case-insensitive, maximum 64 characters | Bug |
| Description | text | Optional, maximum 256 characters | Work that describes a defect |
| Symbol | icon identifier | One of the icons exposed by the frontend icon system (lucide names) | `Bug` |
| Symbol color | palette token | One of the nine curated palette tokens shared with labels | `red` |
| Font color | palette token | Same palette as symbol color | `red` |
| Position | integer | Ordering within the workspace | 2 |
| Is default | boolean | At most one true per workspace | false |

Seed content for new workspaces:

| Name | Symbol | Symbol color | Font color |
|---|---|---|---|
| Task | `SquareCheckBig` | slate | slate |
| Bug | `Bug` | red | red |
| Doc | `FileText` | emerald | emerald |

The palette is the existing nine-token label palette (stone, slate, violet, emerald, green, amber, orange, rose, red), resolved through theme-aware CSS variables so light and dark themes remain accessible without storing raw hex values.

## 3. Data Model

### 3.1 New table: `task_attribute`

```
task_attribute
  id                text  primary key (cuid2)
  workspace_id      text  not null -> workspace.id, cascade
  name              text  not null
  description       text
  icon              text  not null
  icon_color        text  not null
  text_color        text  not null
  position          integer not null default 0
  is_default        boolean not null default false
  created_at        timestamp
  updated_at        timestamp
  unique (workspace_id, lower(name))
  index (workspace_id, position)
```

### 3.2 Task change

```
task
  attribute_id      text  -> task_attribute.id, on delete set null
  index (attribute_id)
```

Deletion protection follows the label pattern: a deletion-lock check refuses to delete an attribute still referenced by any task, returning HTTP 409 with the reference count. A forced variant reassigns affected tasks to the workspace default and then deletes, recorded as an activity event.

A single column-level check constraint is not placed on `is_default`; the service layer enforces at most one default per workspace within one transaction.

### 3.3 Null semantics

`attribute_id` null is valid and renders without an indicator. The workspace default is applied only at creation time when the request omits the field; existing tasks are never silently rewritten. This avoids a backfill and preserves import fidelity.

## 4. Backend Design

A new module `apps/api/src/task-attribute` following the established structure: `schema.ts` (Zod and OpenAPI schemas), `controllers/` (handlers), `response.ts` (serializers), `index.ts` (Hono router registration).

### 4.1 Endpoints

| Method | Path | Purpose | Permission |
|---|---|---|---|
| GET | `/task-attribute/workspace/{workspaceId}` | Ordered list | Workspace member |
| POST | `/task-attribute/workspace/{workspaceId}` | Create | `taskAttribute: create` |
| PUT | `/task-attribute/{id}` | Update name, description, symbol, colors, position, default | `taskAttribute: update` |
| DELETE | `/task-attribute/{id}` | Delete with reference check | `taskAttribute: delete` |
| POST | `/task-attribute/{id}/reorder` | Move within order | `taskAttribute: update` |

### 4.2 Task integration

- `createTaskBody` and `updateTaskBody` gain an optional `attributeId`, validated to belong to the task workspace (HTTP 400 otherwise).
- Task list responses include the serialized attribute (id, name, icon, iconColor, textColor, position) joined from the definition.
- `listTasksQuery` gains `attributeId` and `attribute=none` filters; `sortBy` gains `attribute` (by definition position).
- `bulkUpdateBody` gains the operation `updateAttribute`.
- Task move, duplicate, and import preserve `attributeId` when the target workspace contains an attribute with the same id; cross-workspace moves map by name and fall back to the target default.

### 4.3 Validation rules

1. Name: trimmed, 1 to 64 characters, unique per workspace case-insensitively.
2. Icon: must exist in the frontend icon registry list; the backend holds the same allow-list constant to reject unknown identifiers.
3. Colors: must be one of the nine palette tokens.
4. Default flag: setting a new default clears the previous default in the same transaction.
5. Attribute change on a task requires the ordinary task update permission; definition mutations require the dedicated management permission.

### 4.4 Activity and notifications

Changing an attribute emits an activity entry (for example, `attribute-changed`) with the previous and new names in the event payload, consistent with status and assignee changes. Assignment notifications remain keyed on assignee changes; attribute changes do not notify by default.

## 5. Frontend Design

### 5.1 Settings: Task Attributes section

A new workspace settings section, placed beside the labels and members sections, listing attributes in their configured order. Each row shows a live preview: symbol in symbol color, name in font color, description beneath. Actions: create dialog, inline edit, drag reorder, delete with confirmation that surfaces the reference count.

The create and edit dialog contains:

1. Name field with uniqueness feedback.
2. Symbol picker: a searchable grid of the icons already exposed by the icon system.
3. Symbol color picker: the nine swatches with names, identical to the label color picker.
4. Font color picker: the same swatches, chosen independently from the symbol color.
5. Default toggle, disabled for the currently referenced default.
6. Live preview chip reflecting the current selections.

### 5.2 Task attribute popover

A `task-attribute-popover` mirroring `task-priority-popover`: trigger renders the current attribute (or a neutral placeholder), the popover lists workspace attributes ordered by position, each row shows the symbol in its symbol color and the name in its font color, plus a None option and a search field when more than eight attributes exist. Selection issues the update mutation, invalidates the task queries, and shows the established toast feedback.

The popover is mounted in the task properties sidebar, in the task details content, and in the quick-create composer (board and command palette), where the default attribute is preselected.

### 5.3 Rendering across surfaces

| Surface | Rendering |
|---|---|
| Kanban card | Symbol in symbol color left of the title; name in font color as a small badge on hover for density |
| List and backlog rows | Symbol and name badge in a fixed column, font color applied to the name |
| Calendar event chip | Symbol only, symbol color |
| Gantt bar | Symbol before the task title, symbol color |
| My tasks, inbox, search results | Symbol and name badge, consistent with list rows |
| Task detail header | Symbol and name badge adjacent to the title, editable via the popover |
| Public project views | Read-only symbol and name badge |
| Command palette and global search | Attribute filter facet using symbol and font color |

A shared `TaskAttributeBadge` component owns the rendering contract (symbol resolution, color token resolution, truncation, accessible label) so every surface stays consistent. An `attribute-changed` activity entry renders the two symbols with an arrow in the activity feed.

### 5.4 State and data flow

Web-side additions follow the existing structure: types in `apps/web/src/types`, fetchers and hooks under `hooks/queries/task-attribute` and `hooks/mutations/task-attribute`, with React Query cache keys `["task-attributes", workspaceId]` invalidated after mutations. Task queries are refetched or patched after attribute changes, matching the existing invalidation pattern in the labels popover.

## 6. Permissions

The permission model follows the repository resource/action convention:

1. `taskAttribute: [create, read, update, delete]`: definition CRUD and reorder. Granted to the workspace admin and owner roles by default and available to custom roles.
2. Task attribute assignment requires no new permission beyond task update.

The settings nav hides the section for members without the management permission, exactly as other settings sections behave today.

## 7. API, MCP, and Importers

- OpenAPI: new schemas (`TaskAttribute`, `TaskAttributeCreate`, `TaskAttributeUpdate`), the five endpoints, and the extended task schemas.
- MCP (`packages/mcp`): new tools `list_task_attributes` plus task create and update tools accepting `attributeId` and returning the attribute in task payloads; the existing task-response serializer is extended.
- Jira importer: issue type mapped by name to a workspace attribute, with a configuration flag to create missing attributes; unmapped types fall back to the default.
- Planka importer: maps card labels and list names onto attributes only when explicitly configured; default fallback otherwise.
- Calendar feeds and webhooks carry the attribute name in payloads for external consumers.

## 8. Edge Cases

| Case | Behavior |
|---|---|
| Workspace default attribute deleted | Deletion blocked while referenced; the last remaining default cannot be deleted at all |
| All attributes deleted | Tasks render without indicators; creation omits the field |
| Duplicate name, different case | Rejected with 409, uniqueness is case-insensitive |
| Icon removed from the frontend registry in a later release | Fallback symbol with the stored colors; the registry is append-only by convention |
| Cross-workspace task move | Name-based mapping, then default fallback |
| Concurrent default change | Last-write-wins within one transaction; the single-default invariant is enforced transactionally |
| Read-only member | Popovers render as plain elements; no edit affordances |

## 9. Accessibility and Internationalization

1. Symbols are decorative; each badge exposes an accessible name (the attribute name) so screen readers announce the type.
2. Font colors are chosen from contrast-validated palette tokens; symbol color and font color may differ, for example an amber symbol with stone text.
3. All labels, dialogs, toasts, and empty states are externalized to the i18n framework with new namespaces under the existing translation structure.

## 10. Release Notes Summary

Workspace administrators can now define task attributes with symbols and colors at the workspace level; every task can be classified as a task, bug, doc, or any custom type; attributes appear across all views, are filterable, bulk-editable, and exposed through the API and MCP.
