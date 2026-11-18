import { readFileSync } from "node:fs";
const log = readFileSync("lint.log", "utf8");
const lines = log.split("\n");
const structured = /^([^\s(]+)\((\d+),(\d+)\): error TS(\d+): (.*)$/;
const seen = new Set();
for (const line of lines) {
  if (!line.includes("error TS")) continue;
  if (seen.has(line)) continue;
  seen.add(line);
  const m = line.match(structured);
  if (m) {
    console.log("::error file=" + m[1] + ",line=" + m[2] + ",col=" + m[3] + "::" + m[5] + " [TS" + m[4] + "]");
  } else {
    console.log("::error::" + line.slice(0, 240));
  }
  if (seen.size >= 150) break;
}
console.log("TOTAL_ERROR_LINES=" + seen.size);
