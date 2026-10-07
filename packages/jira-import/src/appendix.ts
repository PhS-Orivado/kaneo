// The "Imported from Jira" appendix. Everything Kaneo has no native field
// for is preserved here, so a 100% transfer never depends on a perfect
// field-for-field mapping.

export type AppendixEntry = {
  label: string;
  value?: unknown;
};

const MAX_VALUE_LENGTH = 4000;

export function serializeAppendixValue(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  if (Array.isArray(value)) {
    if (
      value.every(
        (item) => typeof item === "string" || typeof item === "number",
      )
    ) {
      return value.map(String).join(", ");
    }
    return safeJson(value);
  }
  if (typeof value === "object") return safeJson(value);
  return String(value);
}

function safeJson(value: unknown): string {
  try {
    const text = JSON.stringify(value);
    return text ?? "";
  } catch {
    return "";
  }
}

export function buildAppendix(entries: AppendixEntry[]): string {
  const lines = entries
    .map((entry) => ({
      ...entry,
      serialized: serializeAppendixValue(entry.value),
    }))
    .filter((entry) => entry.serialized.length > 0)
    .map((entry) => {
      const truncated =
        entry.serialized.length > MAX_VALUE_LENGTH
          ? `${entry.serialized.slice(0, MAX_VALUE_LENGTH)}…`
          : entry.serialized;
      return `> - **${entry.label}:** ${truncated.split("\n").join(" ")}`;
    });

  if (lines.length === 0) return "";

  return ["> **Imported from Jira**", ...lines].join("\n");
}

export function appendSections(sections: string[]): string {
  return sections
    .map((section) => section.trim())
    .filter((section) => section.length > 0)
    .join("\n\n");
}
