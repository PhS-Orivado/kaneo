/** Skip webhook sync when it likely echoes our own outbound API update. */
export const OUTBOUND_STATE_ECHO_WINDOW_MS = 5000;

export function parseIssueUpdatedAtMs(issue: {
  fields?: { updated?: string };
}): number | null {
  const raw = issue.fields?.updated;
  if (!raw || typeof raw !== "string") return null;
  const t = Date.parse(raw);
  return Number.isNaN(t) ? null : t;
}
