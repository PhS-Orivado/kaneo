import { localeCompareSort } from "@/lib/format";
import type { TaskAttributeRef } from "@/types/task-attribute";

// RFC 0002: task payloads embed a compact attribute reference. Guards against
// malformed or partial payloads so views can render badges defensively.

export function isTaskAttributeRef(
  value: unknown,
): value is TaskAttributeRef {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.name === "string" &&
    typeof candidate.icon === "string" &&
    typeof candidate.iconColor === "string" &&
    typeof candidate.textColor === "string"
  );
}

// Canonical attribute order: position first, name as a stable tiebreak.
// Mirrors the ordering guaranteed by the task-attribute list endpoint.
export function compareTaskAttributes(
  a: { position: number; name: string },
  b: { position: number; name: string },
  locale?: string,
): number {
  if (a.position !== b.position) return a.position - b.position;
  return localeCompareSort(a.name, b.name, locale);
}

type IdentifiableAttribute = { id: string };

export function getTaskAttributeById<T extends IdentifiableAttribute>(
  attributes: T[] | undefined | null,
  id: string | null | undefined,
): T | undefined {
  if (!attributes || !id) return undefined;
  return attributes.find((attribute) => attribute.id === id);
}
