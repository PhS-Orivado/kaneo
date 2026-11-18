import { readFileSync } from "node:fs";

// Re-emit compiler/lint diagnostics from the captured logs as GitHub
// annotations. Handles both structured tsc output forms:
//   pretty false: path(line,col): error TS1234: message
//   pretty true:  path:line:col - error TS1234: message
// Anything else containing "error TS" is emitted unstructured so it is still
// visible in the run summary.
const structuredParens =
  /^([^\s(]+)\((\d+),(\d+)\): error TS(\d+): (.*)$/;
const structuredPretty =
  /^([^\s:]+\.tsx?):(\d+):(\d+) - error TS(\d+): (.*)$/;

const seen = new Set();
let total = 0;

for (const file of process.argv.slice(2)) {
  if (!file) continue;
  let log;
  try {
    log = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  for (const line of log.split("\n")) {
    const relevant = file.includes("openapi")
      ? /error|out of date|regenerated|missing/i.test(line)
      : line.includes("error TS");
    if (!relevant) continue;
    if (seen.has(line)) continue;
    seen.add(line);
    total++;
    if (total > 150) break;
    const m = line.match(structuredParens) ?? line.match(structuredPretty);
    if (m) {
      console.log(
        `::error file=${m[1]},line=${m[2]},col=${m[3]}::${m[5]} [TS${m[4]}] (${file})`,
      );
    } else if (line.trim()) {
      console.log(`::error::${line.trim().slice(0, 240)} (${file})`);
    }
  }
}
console.log(`TOTAL_ERROR_LINES=${total}`);
