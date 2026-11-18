import { readFileSync } from "node:fs";

// Re-emit compiler/lint diagnostics from the captured logs as GitHub
// annotations. Handles both structured tsc output forms:
//   pretty false: path(line,col): error TS1234: message
//   pretty true:  path:line:col - error TS1234: message
// The openapi log gets a wider filter because its failures are textual
// ("out of date", "regenerated"). Never exit non-zero: a broken annotation
// must not take the debug job down.
const structuredParens =
  /^([^\s(]+)\((\d+),(\d+)\): error TS(\d+): (.*)$/;
const structuredPretty =
  /^([^\s:]+\.tsx?):(\d+):(\d+) - error TS(\d+): (.*)$/;

let emitted = 0;
const MAX = 150;

for (const file of process.argv.slice(2)) {
  if (!file) continue;
  let log;
  try {
    log = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  for (const line of log.split("\n")) {
    try {
      const relevant = file.includes("openapi")
        ? /error|out of date|regenerated|missing/i.test(line)
        : line.includes("error TS");
      if (!relevant || emitted >= MAX) continue;
      const m = line.match(structuredParens) ?? line.match(structuredPretty);
      if (m) {
        console.log(
          `::error file=${m[1]},line=${m[2]},col=${m[3]}::${m[5]} [TS${m[4]}] (${file})`,
        );
        emitted += 1;
      } else if (line.trim()) {
        console.log(`::error::${line.trim().slice(0, 240)} (${file})`);
        emitted += 1;
      }
    } catch (error) {
      console.log(`::warning::parser skipped a malformed line (${file})`);
    }
  }
}
console.log(`TOTAL_ERROR_LINES=${emitted}`);
