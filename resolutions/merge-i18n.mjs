// Three-way merge for conflicted i18n locale files during the re-land.
// Stage 2 (ours) is the upstream side, stage 3 (theirs) the pre-reset fork
// state, stage 1 the common base. The merged file starts from the upstream
// file, so upstream's removals and rewordings win; the fork's delta versus
// the base (added keys and changed values, with its translations) is then
// applied on top.
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const run = (args) =>
  execFileSync("git", args, { encoding: "utf8", maxBuffer: 128 * 1024 * 1024 });

const unmerged = run(["diff", "--name-only", "--diff-filter=U", "--", "i18n/"])
  .split("\n")
  .filter(Boolean);

if (unmerged.length === 0) {
  console.log("merge-i18n: no unmerged i18n files");
}

const isObject = (v) =>
  v !== null && typeof v === "object" && !Array.isArray(v);

// The keys and values the fork added or changed relative to the base.
function forkDelta(theirs, base) {
  const delta = {};
  for (const [key, value] of Object.entries(theirs)) {
    if (!(key in base)) {
      delta[key] = { value: value, nested: false };
    } else if (isObject(base[key]) && isObject(value)) {
      const sub = forkDelta(value, base[key]);
      if (Object.keys(sub).length > 0) {
        delta[key] = { value: sub, nested: true };
      }
    } else if (base[key] !== value) {
      delta[key] = { value: value, nested: false };
    }
  }
  return delta;
}

// Apply the fork delta onto the upstream file. Keys upstream removed stay
// removed; the reference locale governs the final key set.
function applyDelta(ours, delta, pathHint) {
  let added = 0;
  for (const [key, entry] of Object.entries(delta)) {
    const here = pathHint + "." + key;
    if (entry.nested) {
      if (key in ours && isObject(ours[key])) {
        added += applyDelta(ours[key], entry.value, here);
      } else if (!(key in ours)) {
        console.log(
          "merge-i18n: " + here + " was extended by the fork but removed upstream; dropping it",
        );
      }
      continue;
    }
    if (key in ours) {
      if (ours[key] !== entry.value) {
        console.log("merge-i18n: " + here + " differs; keeping the fork value");
        ours[key] = structuredClone(entry.value);
      }
      continue;
    }
    ours[key] = structuredClone(entry.value);
    added += 1;
  }
  return added;
}

for (const file of unmerged) {
  const readStage = (stage) => {
    try {
      return JSON.parse(run(["show", ":" + stage + ":" + file]));
    } catch {
      return undefined;
    }
  };
  const ours = readStage(2);
  const theirs = readStage(3);
  const base = readStage(1);
  if (!ours || !theirs) {
    console.error("merge-i18n: " + file + " is not a modify/modify conflict");
    process.exitCode = 1;
    continue;
  }
  const delta = forkDelta(theirs, base ?? {}, file);
  const merged = structuredClone(ours);
  const added = applyDelta(merged, delta, file);
  fs.writeFileSync(file, JSON.stringify(merged, null, "\t") + "\n");
  console.log("merge-i18n: merged " + file + " (+" + added + " fork keys)");
}
