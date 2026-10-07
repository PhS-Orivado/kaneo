// Palette for derived labels (issue types, components, versions, sprints).
// Jira only colors labels, not issue types or components, so every generated
// Kaneo label gets a stable color derived from its name.
const LABEL_PALETTE = [
  "#0a63a0",
  "#109dc0",
  "#52b9d5",
  "#beca02",
  "#77ce87",
  "#ced85e",
  "#f9c423",
  "#fad371",
  "#ed9223",
  "#de692f",
  "#fc736c",
  "#e83855",
  "#e34f7c",
  "#f97394",
  "#ad5f7d",
  "#975298",
  "#b287bd",
  "#7e86c7",
  "#406cbd",
  "#1d7299",
  "#00858a",
  "#00b4b1",
  "#2b6a6c",
  "#4a8753",
  "#8aa177",
  "#96b352",
  "#87564a",
  "#a85540",
  "#c7a57a",
  "#8b8680",
  "#69655a",
  "#4f6573",
];

const FALLBACK_COLOR = "#6b7280";

export function labelColorFor(name: string): string {
  let hash = 0;
  for (const char of name) {
    hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0;
  }

  return LABEL_PALETTE[hash % LABEL_PALETTE.length] ?? FALLBACK_COLOR;
}

export { FALLBACK_COLOR, LABEL_PALETTE };
