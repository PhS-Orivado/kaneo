const BILLABLE_STATUSES = new Set(["active", "trialing", "past_due"]);

export type SubscriptionState = {
  subscriptionId: string | null;
  status: string | null;
};

export function hasBillableSubscription(
  billing: SubscriptionState | null | undefined,
) {
  if (!billing?.subscriptionId) {
    return false;
  }

  return BILLABLE_STATUSES.has(billing.status ?? "");
}
