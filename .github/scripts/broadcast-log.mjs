import { readFileSync } from "node:fs";

// Broadcast every nonempty captured log line as a GitHub annotation so the
// captured diagnostics are visible on the run page without log access.
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
    const trimmed = line.trim();
    if (!trimmed) continue;
    total++;
    if (total > 400) {
      console.log(`::error::BROADCAST_LIMIT_REACHED (${file})`);
      process.exit(0);
    }
    const safe = trimmed.replace(/[`\r]/g, "").slice(0, 220);
    console.log(`::error file=${file}::${safe}`);
  }
}
console.log(`TOTAL_LINES=${total}`);
