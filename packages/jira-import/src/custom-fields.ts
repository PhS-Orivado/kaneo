import type { JiraFieldMetadata, JiraIssue } from "./jira.js";

export type CustomFieldType =
  | "text"
  | "number"
  | "date"
  | "dropdown"
  | "boolean"
  | "multiselect";

export type CustomFieldPlan = {
  jiraId: string;
  name: string;
  type: CustomFieldType;
  options?: string[];
  values: Map<string, string>;
};

export type CustomFieldSummary = {
  planned: CustomFieldPlan[];
  unmapped: { issueKey: string; name: string; value: unknown }[];
};

const SKIPPED_FIELD_NAMES = new Set([
  "sprint",
  "epic link",
  "epic name",
  "rank",
  "parent",
]);

/**
 * Jira custom fields that fit a Kaneo custom field type become real fields;
 * everything else lands in the appendix through `unmapped`. Fields are
 * classified from Jira's own field metadata, never from hard-coded IDs.
 */
export function planCustomFields(
  issues: JiraIssue[],
  fieldMetadata: JiraFieldMetadata[],
): CustomFieldSummary {
  const metaById = new Map(fieldMetadata.map((field) => [field.id, field]));
  const plannedById = new Map<string, CustomFieldPlan>();
  const unmapped: CustomFieldSummary["unmapped"] = [];

  for (const issue of issues) {
    for (const [jiraId, rawValue] of Object.entries(issue.fields)) {
      if (!jiraId.startsWith("customfield_")) continue;
      if (isEmptyValue(rawValue)) continue;

      const meta = metaById.get(jiraId);
      const name = meta?.name?.trim() || jiraId;
      if (SKIPPED_FIELD_NAMES.has(name.toLowerCase())) continue;
      if (meta?.schema?.custom?.includes("greenhopper")) continue;

      const value = normalizeCustomFieldValue(meta, rawValue);
      if (value == null) {
        unmapped.push({ issueKey: issue.key, name, value: rawValue });
        continue;
      }

      const existing = plannedById.get(jiraId);
      if (existing) {
        existing.values.set(issue.key, value.value);
        if (
          existing.options &&
          value.option &&
          !existing.options.includes(value.option)
        ) {
          existing.options.push(value.option);
        }
        continue;
      }

      plannedById.set(jiraId, {
        jiraId,
        name,
        type: value.type,
        values: new Map([[issue.key, value.value]]),
        ...(value.option ? { options: [value.option] } : {}),
      });
    }
  }

  return { planned: [...plannedById.values()], unmapped };
}

type NormalizedFieldValue = {
  type: CustomFieldType;
  value: string;
  option?: string;
};

function normalizeCustomFieldValue(
  meta: JiraFieldMetadata | undefined,
  raw: unknown,
): NormalizedFieldValue | null {
  const schema = meta?.schema;
  const type = schema?.type;

  if (type === "number") {
    return typeof raw === "number" && Number.isFinite(raw)
      ? { type: "number", value: String(raw) }
      : null;
  }

  if (type === "datetime" || type === "date") {
    const date = new Date(String(raw));
    return Number.isNaN(date.getTime())
      ? null
      : { type: "date", value: date.toISOString() };
  }

  if (type === "boolean") {
    return { type: "boolean", value: raw === true ? "true" : "false" };
  }

  if (type === "option" && isOption(raw)) {
    return { type: "dropdown", value: raw.value, option: raw.value };
  }

  if (type === "array") {
    if (schema?.items === "option" && Array.isArray(raw)) {
      const options = raw.filter(isOption).map((option) => option.value);
      if (options.length === 0) return null;
      return {
        type: "multiselect",
        value: JSON.stringify(options),
        option: options[options.length - 1],
      };
    }

    if (schema?.items === "string" && Array.isArray(raw)) {
      const strings = raw.filter(
        (item): item is string => typeof item === "string" && item.length > 0,
      );
      if (strings.length === 0) return null;
      return {
        type: "multiselect",
        value: JSON.stringify(strings),
        option: strings[strings.length - 1],
      };
    }
  }

  if (typeof raw === "string" && raw.trim()) {
    return { type: "text", value: raw.trim() };
  }

  return null;
}

function isOption(value: unknown): value is { value: string; id?: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { value?: unknown }).value === "string"
  );
}

function isEmptyValue(value: unknown): boolean {
  if (value == null) return true;
  if (Array.isArray(value) && value.length === 0) return true;
  if (typeof value === "string" && value.trim() === "") return true;
  return false;
}

export function findFieldIdByName(
  fieldMetadata: JiraFieldMetadata[],
  name: string,
): string | null {
  return (
    fieldMetadata.find(
      (field) => field.name?.toLowerCase() === name.toLowerCase(),
    )?.id ?? null
  );
}
