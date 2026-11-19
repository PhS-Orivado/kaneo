type Rule = {
  id: string;
  integrationType: string;
  eventType: string;
  columnId: string;
  // RFC 0001 WP6: null designates a provider-wide rule; a non-null value
  // scopes the rule to a single repository binding.
  integrationId?: string | null;
};

type RuleChange =
  | { type: "upsert"; columnId: string }
  | { type: "delete"; id: string }
  | { type: "none" };

export function planRuleChange(
  rules: Rule[],
  integrationType: string,
  eventType: string,
  columnId: string | null,
): RuleChange {
  // The provider-wide editor manages type-wide rules only: a rule scoped
  // to one repository binding is neither displayed nor selected here, so a
  // provider-level change can never silently overwrite or delete it.
  const rule = rules.find(
    (candidate) =>
      candidate.integrationId == null &&
      candidate.integrationType === integrationType &&
      candidate.eventType === eventType,
  );

  if (columnId) {
    return rule?.columnId === columnId
      ? { type: "none" }
      : { type: "upsert", columnId };
  }

  return rule ? { type: "delete", id: rule.id } : { type: "none" };
}
