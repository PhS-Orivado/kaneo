# Re-land resolutions

This directory carries the conflict resolutions for merging the pre-reset
multi-repository state (merge source 0d3149e38, the fork main through
PR #20) back onto the upstream v2.41.1 base of main. The probe workflow
(.github/workflows/reland-probe.yml) performs the merge and applies these
resolutions; nothing here ships with the merge itself.

- "resolve.sh" reconstructs every conflicted file from its merge stages:
  the fork side where the fork rewrote the surface, the upstream side for
  generated artifacts and the workspace manifest, and the patches in
  "patches/" that fold the upstream conventions of v2.41.1 (the ApiError
  class, HttpError.fromResponse, the extracted LookupResource type, the
  simplified route error descriptions) into the fork's structure.
- "patches/" holds one unified diff per patched file, generated from the
  merge source, so no file content is authored by hand.
- "merge-i18n.mjs" three-way merges every conflicted locale file: the
  upstream file wins (its removals and rewordings), the fork's delta
  versus the merge base (added keys and changed values) is applied on
  top, preserving the fork's translations. The result passes
  "pnpm i18n:check" against the merged en-US reference.
- The regenerated Drizzle migration and the OpenAPI export are produced
  by the finish job of the workflow after the merge is committed, using
  the repository's own scripts ("pnpm --dir apps/api db:generate" and
  "pnpm openapi:check:fix"), so no migration or export is written by hand.
