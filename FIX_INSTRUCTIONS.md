# Fix for Integration Table Column Mismatch

## Problem

The application is failing with errors because the `integration` table schema in the codebase has additional columns (`repository_key`, `repository_owner`, `repository_name`, `repository_id`, `base_url`) that were never migrated to the database. When Drizzle ORM generates queries that try to select from this table, it includes these columns and PostgreSQL throws an error:

```
error: column externalLinkTable_integration.repository_key does not exist
```

This affects:
1. The `deferred-issue-edits` cron job
2. The Gitea integration endpoint (`/api/gitea-integration/project/{projectId}`)
3. Any other endpoint that queries the integration table with relations

## Solution

There are two approaches:

### Option 1: Apply Database Migration (Recommended)

Run the following commands to generate and apply the migration:

```bash
cd /home/ec-service/deploy/kaneo/apps/api
pnpm db:migrate
```

Or apply the migration manually:

The migration file `0061_add_integration_repository_columns.sql` has been created in `apps/api/drizzle/`. Apply it to your database using your PostgreSQL client.

### Option 2: Code Changes (Temporary Fix)

If you cannot apply the migration immediately, the code has been updated to explicitly select only the columns that exist in the database, rather than selecting all columns. This fixes the immediate errors but doesn't add the missing columns to the database.

The following files were modified:
- `apps/api/src/plugins/github/services/deferred-issue-edits.ts`
- `apps/api/src/plugins/github/services/link-manager.ts`
- `apps/api/src/plugins/github/utils/sync-label-to-github.ts`
- `apps/api/src/plugins/gitlab/utils/sync-label-to-gitlab.ts`
- `apps/api/src/plugins/gitea/utils/sync-label-to-gitea.ts`

These changes replace `with: { integration: true }` with `with: { integration: { columns: { id: true, projectId: true, type: true, config: true, isActive: true } } }` to explicitly select only the columns that exist in the database.

## Files Changed

1. **Migration File Created**: `apps/api/drizzle/0061_add_integration_repository_columns.sql`
   - Adds the missing columns to the integration table

2. **Code Fixes**:
   - `apps/api/src/plugins/github/services/deferred-issue-edits.ts`
   - `apps/api/src/plugins/github/services/link-manager.ts`
   - `apps/api/src/plugins/github/utils/sync-label-to-github.ts`
   - `apps/api/src/plugins/gitlab/utils/sync-label-to-gitlab.ts`
   - `apps/api/src/plugins/gitea/utils/sync-label-to-gitea.ts`
   - All modified to explicitly select only existing columns from integration table

## Next Steps

1. **Immediate fix**: The code changes should prevent the errors from occurring
2. **Permanent fix**: Apply the migration to add the missing columns to the database
3. **Verification**: After applying the migration, all queries should work correctly

## Notes

- The repository columns (`repository_key`, `repository_owner`, `repository_name`, `repository_id`, `base_url`) are defined as nullable in the schema, so adding them to existing rows will set them to NULL
- These columns appear to be part of RFC 0001 for multi-repository support, as indicated in the schema comments
- The code currently gets repository information from the config JSON, not from these database columns
