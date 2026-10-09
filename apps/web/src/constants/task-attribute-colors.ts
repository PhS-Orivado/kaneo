// RFC 0002: the nine-token palette shared with the API validation constant,
// resolved through theme-aware CSS variables so light and dark themes remain
// accessible without storing raw hex values. Mirrors the label palette.

const taskAttributeColors = [
  { value: "stone", label: "Stone", color: "var(--color-stone-500)" },
  { value: "slate", label: "Slate", color: "var(--color-slate-500)" },
  { value: "violet", label: "Lavender", color: "var(--color-violet-500)" },
  { value: "emerald", label: "Sage", color: "var(--color-emerald-600)" },
  { value: "green", label: "Forest", color: "var(--color-green-600)" },
  { value: "amber", label: "Amber", color: "var(--color-amber-600)" },
  { value: "orange", label: "Terracotta", color: "var(--color-orange-600)" },
  { value: "rose", label: "Rose", color: "var(--color-rose-600)" },
  { value: "red", label: "Crimson", color: "var(--color-red-600)" },
];

export default taskAttributeColors;
