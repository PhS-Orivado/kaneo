#!/usr/bin/env bash
# Conflict resolutions for merging the pre-reset fork state onto the
# upstream v2.41.1 base. Every conflicted file is reconstructed from its
# merge stages: the fork side where the fork rewrote the surface, the
# upstream side for generated artifacts, and small patches that fold the
# upstream conventions of v2.41.1 into the fork's structure. No file
# content is authored by hand. Each rule only touches files that are
# actually unmerged, so the script stays valid for later re-land stages.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"

unmerged() {
  git diff --name-only --diff-filter=U -- "$1" | grep -q .
}

# Files the fork rewrote wholesale: take the fork side.
take_theirs=(
  apps/api/src/github-integration/response.ts
  apps/web/src/fetchers/gitea-integration/update-gitea-integration.ts
  apps/web/src/fetchers/gitlab-integration/delete-gitlab-integration.ts
  apps/web/src/fetchers/gitlab-integration/import-gitlab-issues.ts
  apps/web/src/fetchers/gitlab-integration/update-gitlab-integration.ts
  apps/web/src/fetchers/integration-sync/get-sync-rules.ts
  apps/web/src/fetchers/integration-sync/preview-sync-rules.ts
  apps/web/src/fetchers/integration-sync/resume-sync.ts
  apps/web/src/fetchers/integration-sync/review-sync-resume.ts
  apps/web/src/fetchers/integration-sync/save-sync-rules.ts
)
for file in "${take_theirs[@]}"; do
  if unmerged "$file"; then
    git checkout --theirs -- "$file"
    # The web fetchers predate the upstream HttpError.fromResponse refactor.
    sed -i 's/throw new HttpError(response.status, await response.text());/throw await HttpError.fromResponse(response);/' "$file"
    git add -- "$file"
  fi
done

# Fetchers the fork deleted outright (delete/modify conflicts).
git rm -q --ignore-unmatch -- \
  apps/web/src/fetchers/gitea-integration/get-gitea-integration.ts \
  apps/web/src/fetchers/github-integration/get-github-integration.ts \
  apps/web/src/fetchers/gitlab-integration/get-gitlab-integration.ts

# API sources: the fork side plus a patch that folds the upstream
# conventions of v2.41.1 into it.
patch_theirs=(
  apps/api/src/gitea-integration/index.ts
  apps/api/src/gitlab-integration/index.ts
  apps/api/src/gitlab-integration/controllers/list-gitlab-projects.ts
  apps/api/src/utils/workspace-access-middleware.ts
  apps/api/src/workflow-rule/index.ts
)
for file in "${patch_theirs[@]}"; do
  if unmerged "$file"; then
    patchfile="$here/patches/$(printf '%s' "$file" | tr '/' '@').patch"
    git checkout --theirs -- "$file"
    patch --quiet --forward "$file" "$patchfile"
    git add -- "$file"
  fi
done

# Workspace manifest: the upstream side plus the fork's build dependencies.
if unmerged pnpm-workspace.yaml; then
  git checkout --ours -- pnpm-workspace.yaml
  patch --quiet --forward pnpm-workspace.yaml "$here/patches/pnpm-workspace.yaml.patch"
  git add -- pnpm-workspace.yaml
fi

# The OpenAPI export is regenerated from the merged sources by the finish
# job; keep the upstream side here.
if unmerged apps/docs/openapi.json; then
  git checkout --ours -- apps/docs/openapi.json
  git add -- apps/docs/openapi.json
fi

# Drizzle metadata: keep the upstream journal and snapshots, drop the
# fork's own migrations, and let the finish job generate a fresh migration
# on top of the upstream snapshot chain from the merged schema.
while IFS= read -r file; do
  git checkout --ours -- "$file"
  git add -- "$file"
done < <(git diff --name-only --diff-filter=U -- apps/api/drizzle/meta/)

git rm -q --ignore-unmatch -- \
  apps/api/drizzle/0062_repository_binding_identity.sql \
  apps/api/drizzle/0063_sprint_planning.sql \
  apps/api/drizzle/0064_sprint_carry_over.sql \
  apps/api/drizzle/meta/0064_snapshot.json

# Locale files: three-way merge that keeps the upstream key set and applies
# the fork's delta (added keys, changed values) with its translations.
node "$here/merge-i18n.mjs"

git add -A
