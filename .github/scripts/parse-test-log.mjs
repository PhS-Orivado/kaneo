import { readFileSync } from "node:fs";

// Re-emit vitest failure lines from the captured logs as GitHub annotations
// so failing tests are visible from the run summary without downloading
// logs. The raw logs are also committed to the debug branch by the collector
// job, which stays the source of truth for the full failure text.
const ansi = /\x1b\[[0-9;]*m/g;
let emitted = 0;
const MAX = 150;

function emit(props, message, source) {
  if (emitted >= MAX) return;
  const propsPart = props ? ` ${props}` : "";
  const text = String(message)
    .replace(/[\r\n]+/g, " ")
    .replace(/`/g, "'")
    .slice(0, 220);
  console.log(`::error${propsPart}::${text} (${source})`);
  emitted += 1;
}

for (const file of process.argv.slice(2)) {
  if (!file) continue;
  let log;
  try {
    log = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  const lines = log.split("\n").map((line) => line.replace(ansi, ""));
  let lastLoc = null;
  for (const raw of lines) {
    const line = raw.trimEnd();
    const fail = line.match(/^FAIL\s+(\S+)/);
    if (fail) {
      emit(null, `FAIL ${fail[1]}`, file);
      lastLoc = null;
      continue;
    }
    const loc = line.match(
      /(?:\u276f|\bat )\s*([^\s(]+\.(?:ts|tsx|mjs)):(\d+):(\d+)/,
    );
    if (loc) {
      lastLoc = { file: loc[1], line: loc[2] };
      continue;
    }
    if (
      /AssertionError|expected .* to (be|have|equal|contain|match|deeply|throw)|Test timed out|unhandled rejection|uncaught exception|Vitest caught error|Cannot read|TestingLibraryElementError|Error:/i.test(
        line,
      ) &&
      line.trim()
    ) {
      if (lastLoc) {
        emit(`file=${lastLoc.file},line=${lastLoc.line}`, line.trim(), file);
        lastLoc = null;
      } else {
        emit(null, line.trim(), file);
      }
    }
  }
}
console.log(`TOTAL_TEST_ERROR_LINES=${emitted}`);
