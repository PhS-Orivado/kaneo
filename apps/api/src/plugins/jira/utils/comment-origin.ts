// Persist the origin in Jira so delayed webhooks and later imports also skip
// echoes. Jira comment bodies are plain text, so the marker is a text prefix.
const KANEO_COMMENT_PREFIX = "kaneo:comment\n\n";

export function markKaneoComment(body: string): string {
  return `${KANEO_COMMENT_PREFIX}${body}`;
}

export function isKaneoComment(body: string): boolean {
  return body.startsWith(KANEO_COMMENT_PREFIX);
}

export function bodyFromKaneoComment(body: string): string {
  return isKaneoComment(body) ? body.slice(KANEO_COMMENT_PREFIX.length) : body;
}
