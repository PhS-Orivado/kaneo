#!/usr/bin/env python3
"""One-shot upstream sync applier for branch sync/upstream-2026-11-14.

Merges upstream usekaneo/kaneo main (adfd2082) into the fork's deploy-based
sync branch with the following resolution policy:

- Paths upstream changed that the fork never customized since the last
  sync are taken verbatim from upstream.
- Paths the fork customized and upstream has NOT touched since the last
  sync keep the fork version.
- apps/web/src/hooks/use-project-websocket.ts is hand-merged (fork's
  SPRINT_UPDATED handler + upstream's TASK_MOVED relation invalidation).
- apps/api/drizzle/0073_thick_talisman.sql is skipped: the fork already
  applied that migration as 0076_thick_talisman.sql with its own chain.

The result is committed as a true merge commit (parents: current branch
head + upstream tip), then pushed. The script verifies the working tree
against expectations and refuses to push on any mismatch.
"""
import hashlib
import os
import subprocess
import sys

BRANCH = "sync/upstream-2026-11-14"
BASE_SHA = "265f1fd548d0cfe9686990b692abbcdfc15e3604"
UPSTREAM_SHA = "adfd208273a4f9f2722c0d6803177f921ed94c6e"
LAST_SYNC_SHA = "5069fb56ce309d5572ca3ed60d4d3c322a03a452"
UPSTREAM_URL = "https://github.com/usekaneo/kaneo.git"
MERGED_PATH = "apps/web/src/hooks/use-project-websocket.ts"
MERGED_BLOB_SHA = "0c5bd6ad43ffc26f63c8a0a4d6680921bf2fd751"
HELPERS = [
    ".github/workflows/sync-upstream-2026-11-14.yml",
    "scripts/upstream-sync/apply-sync.py",
]
COMMIT_MSG = (
    "sync: merge upstream usekaneo/kaneo@adfd208 into deploy (2026-11-14)\n\n"
    "Applies upstream main adfd208273a4f9f2722c0d6803177f921ed94c6e on top of\n"
    "the fork deploy branch.\n\n"
    "- Upstream-modified paths the fork never customized are taken verbatim\n"
    "  from upstream (including pnpm-lock.yaml, drizzle snapshot 0067 and\n"
    "  the new task relation invalidation helpers).\n"
    "- Fork-customized paths upstream has not touched since the last sync\n"
    "  keep the fork version (all i18n locales, openapi.json, drizzle\n"
    "  migration chain, task filters and project/websocket code).\n"
    "- use-project-websocket.ts merges the fork's SPRINT_UPDATED handler\n"
    "  with upstream's new TASK_MOVED relation invalidation.\n"
    "- Upstream migration 0073_thick_talisman.sql is skipped: the fork\n"
    "  already applied it as 0076_thick_talisman.sql.\n"
)

KEEP_FORK = {
    "apps/api/drizzle/0073_thick_talisman.sql",
    "apps/api/drizzle/meta/0073_snapshot.json",
    "apps/api/drizzle/meta/_journal.json",
    "apps/api/src/database/schema.ts",
    "apps/api/src/project/controllers/update-project.ts",
    "apps/api/src/project/index.ts",
    "apps/api/src/project/response.ts",
    "apps/api/src/project/schema.ts",
    "apps/api/src/storage/s3.ts",
    "apps/api/src/task/controllers/get-tasks.ts",
    "apps/api/src/task/response.ts",
    "apps/docs/openapi.json",
    "apps/web/src/components/project/task-filters/use-filter-subjects.tsx",
    "apps/web/src/components/project/toolbar/project-toolbar.tsx",
    "apps/web/src/components/project/toolbar/use-project-task-view.ts",
    "apps/web/src/components/shared/modals/create-task-modal.tsx",
    "apps/web/src/fetchers/project/update-project.ts",
    "apps/web/src/hooks/mutations/use-sign-out.ts",
    "apps/web/src/hooks/use-task-filters-with-labels-support.test.tsx",
    "apps/web/src/hooks/use-task-filters-with-labels-support.ts",
    "apps/web/src/hooks/use-task-filters.ts",
    "apps/web/src/lib/task-filters/count-active-filters.ts",
    "apps/web/src/lib/task-filters/task-matches-filters.ts",
    "apps/web/src/types/task/index.ts",
    "i18n/az-AZ.json",
    "i18n/de-DE.json",
    "i18n/el-GR.json",
    "i18n/en-US.json",
    "i18n/es-ES.json",
    "i18n/fr-FR.json",
    "i18n/hi-IN.json",
    "i18n/id-ID.json",
    "i18n/it-IT.json",
    "i18n/ja-JP.json",
    "i18n/ko-KR.json",
    "i18n/mk-MK.json",
    "i18n/nl-NL.json",
    "i18n/pl-PL.json",
    "i18n/pt-BR.json",
    "i18n/ru-RU.json",
    "i18n/tr-TR.json",
    "i18n/uk-UA.json",
    "i18n/vi-VN.json",
    "i18n/zh-CN.json",
    "i18n/zh-TW.json",
}


def fail(msg):
    print("SYNC FAILED: " + msg)
    sys.exit(1)


def git(*args, check=True):
    result = subprocess.run(["git", *args], capture_output=True, text=True)
    if check and result.returncode != 0:
        print("git command failed:", " ".join(args))
        print("stdout:", result.stdout)
        print("stderr:", result.stderr)
        fail("git error, see log above")
    return result


def blob_sha(data):
    header = ("blob %d" % len(data)).encode() + b"\0"
    return hashlib.sha1(header + data).hexdigest()


def read_ref_blob_bytes(rev, path):
    result = subprocess.run(
        ["git", "show", "%s:%s" % (rev, path)], capture_output=True
    )
    if result.returncode != 0:
        return None
    return result.stdout


# --- diff3 three-way merge (identical algorithm to the local analysis) ---
def matching_blocks(a, b):
    import difflib

    return difflib.SequenceMatcher(None, a, b, autojunk=False).get_matching_blocks()


def sync_regions(base, a, b):
    am = matching_blocks(base, a)
    bm = matching_blocks(base, b)
    ia = ib = 0
    regions = []
    while ia < len(am) and ib < len(bm):
        ab, am_, al = am[ia]
        bb, bm_, bl = bm[ib]
        i = max(ab, bb)
        i_end = min(ab + al, bb + bl)
        if i_end > i:
            length = i_end - i
            regions.append(
                (
                    i,
                    i_end,
                    am_ + (i - ab),
                    am_ + (i - ab) + length,
                    bm_ + (i - bb),
                    bm_ + (i - bb) + length,
                )
            )
        if ab + al < bb + bl:
            ia += 1
        else:
            ib += 1
    regions.append((len(base), len(base), len(a), len(a), len(b), len(b)))
    return regions


def merge3(base, a, b):
    ia = ib = iz = 0
    out = []
    conflicts = 0
    for zmatch, zend, amatch, aend, bmatch, bend in sync_regions(base, a, b):
        if amatch > ia or bmatch > ib:
            ours_seg = a[ia:amatch]
            theirs_seg = b[ib:bmatch]
            base_seg = base[iz:zmatch]
            if ours_seg == theirs_seg:
                out += ours_seg
            elif ours_seg == base_seg:
                out += theirs_seg
            elif theirs_seg == base_seg:
                out += ours_seg
            else:
                conflicts += 1
                out += ours_seg
        if zend > zmatch:
            out += base[zmatch:zend]
        iz, ia, ib = zend, aend, bend
    return out, conflicts


def main():
    print("== upstream sync applier: %s ==" % BRANCH)
    branch_ref = "refs/heads/" + BRANCH
    head_sha = git("rev-parse", branch_ref).stdout.strip()
    print("branch head:", head_sha)

    if "upstream" not in git("remote").stdout.split():
        git("remote", "add", "upstream", UPSTREAM_URL)
    git("fetch", "upstream", "main", "--no-tags")
    up_sha = git("rev-parse", "upstream/main").stdout.strip()
    if up_sha != UPSTREAM_SHA:
        fail("upstream/main has moved to %s, expected %s" % (up_sha, UPSTREAM_SHA))
    git("cat-file", "-e", BASE_SHA)
    git("cat-file", "-e", LAST_SYNC_SHA)
    print("upstream/main verified:", up_sha)

    changed = [
        p for p in git("diff", "--name-only", "-z", BASE_SHA, UPSTREAM_SHA).stdout.split("\0") if p
    ]
    print("upstream-changed paths since merge-base:", len(changed))

    expected_staged = set()
    taken = 0
    kept = 0
    for path in changed:
        if path in KEEP_FORK:
            kept += 1
            continue
        if path == MERGED_PATH:
            continue
        up_blob = git("rev-parse", "%s:%s" % (UPSTREAM_SHA, path)).stdout.strip()
        head_blob = git("rev-parse", "%s:%s" % (branch_ref, path), check=False)
        head_blob = head_blob.stdout.strip() if head_blob.returncode == 0 else ""
        if head_blob == up_blob:
            continue
        git("checkout", UPSTREAM_SHA, "--", path)
        with open(path, "rb") as fh:
            actual = blob_sha(fh.read())
        if actual != up_blob:
            fail("blob mismatch after checkout for %s" % path)
        expected_staged.add(path)
        taken += 1
    print("paths taken from upstream:", taken, "| kept fork:", kept)

    # Hand-merged file: fork SPRINT_UPDATED + upstream TASK_MOVED invalidation.
    base_lines = read_ref_blob_bytes(LAST_SYNC_SHA, MERGED_PATH)
    ours_lines = read_ref_blob_bytes(head_sha, MERGED_PATH)
    theirs_lines = read_ref_blob_bytes(UPSTREAM_SHA, MERGED_PATH)
    if base_lines is None or ours_lines is None or theirs_lines is None:
        fail("missing blob for %s merge" % MERGED_PATH)
    merged_lines, conflicts = merge3(
        base_lines.decode("utf-8").splitlines(keepends=True),
        ours_lines.decode("utf-8").splitlines(keepends=True),
        theirs_lines.decode("utf-8").splitlines(keepends=True),
    )
    if conflicts:
        fail("unexpected conflicts in %s" % MERGED_PATH)
    merged = "".join(merged_lines).encode("utf-8")
    if blob_sha(merged) != MERGED_BLOB_SHA:
        fail(
            "merged %s hash mismatch: got %s, expected %s"
            % (MERGED_PATH, blob_sha(merged), MERGED_BLOB_SHA)
        )
    with open(MERGED_PATH, "wb") as fh:
        fh.write(merged)
    expected_staged.add(MERGED_PATH)
    print("hand-merged:", MERGED_PATH)

    for helper in HELPERS:
        if os.path.exists(helper):
            os.remove(helper)
            expected_staged.add(helper)
        else:
            fail("helper file missing: %s" % helper)

    git("add", "-A")
    status = git("status", "--porcelain", "-z").stdout.split("\0")
    staged = set()
    entries = [e for e in status if e]
    idx = 0
    while idx < len(entries):
        entry = entries[idx]
        code = entry[:2]
        path = entry[3:]
        if code[0] in ("R", "C"):
            idx += 1
        staged.add(path)
        idx += 1
    if staged != expected_staged:
        print("staged set mismatch")
        print("missing from index:", sorted(expected_staged - staged))
        print("unexpected in index:", sorted(staged - expected_staged))
        fail("working tree does not match the expected merge result")

    for path in KEEP_FORK:
        if path not in changed:
            continue
        head_blob = git("rev-parse", "%s:%s" % (branch_ref, path), check=False)
        head_blob = head_blob.stdout.strip() if head_blob.returncode == 0 else ""
        if not os.path.exists(path):
            fail("keep-fork path vanished: %s" % path)
        with open(path, "rb") as fh:
            if blob_sha(fh.read()) != head_blob:
                fail("keep-fork path was modified: %s" % path)
    print("keep-fork paths verified untouched")

    tree = git("write-tree").stdout.strip()
    current = git("rev-parse", branch_ref).stdout.strip()
    if current != head_sha:
        fail("branch moved during the run")
    commit = subprocess.run(
        [
            "git",
            "commit-tree",
            tree,
            "-p",
            head_sha,
            "-p",
            UPSTREAM_SHA,
            "-m",
            COMMIT_MSG,
        ],
        capture_output=True,
        text=True,
        env=dict(
            os.environ,
            GIT_AUTHOR_NAME="PhS-Orivado",
            GIT_AUTHOR_EMAIL="89846465+PhS-Orivado@users.noreply.github.com",
            GIT_COMMITTER_NAME="PhS-Orivado",
            GIT_COMMITTER_EMAIL="89846465+PhS-Orivado@users.noreply.github.com",
        ),
    )
    if commit.returncode != 0:
        print(commit.stdout, commit.stderr)
        fail("commit-tree failed")
    new_sha = commit.stdout.strip()
    git("update-ref", branch_ref, new_sha)
    git("push", "origin", branch_ref)
    print("PUSHED MERGE COMMIT:", new_sha)


if __name__ == "__main__":
    main()
