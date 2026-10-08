import { constructWebhookEvent } from "creem/webhooks.js";
import { creemWebhookSecret } from "../../config";
import type {
  BillingWebhookEvent,
  BillingWebhookObject,
} from "../types";

/**
 * Creem's event types already match the internal vocabulary
 * (`checkout.completed`, `subscription.active`, ...), so normalization only
 * flattens the payload: the adapter reads whichever casing Creem ships and
 * emits the provider-neutral object shape.
 */
type CreemWebhookObject = {
  id?: string;
  status?: string;
  metadata?: Record<string, string>;
  product?: { id?: string };
  customer?: { id?: string };
  subscription?: {
    id?: string;
    status?: string;
    metadata?: Record<string, string>;
    product?: { id?: string };
    customer?: { id?: string };
  };
  current_period_end_date?: string;
  currentPeriodEndDate?: string;
  canceled_at?: string | null;
  canceledAt?: string | null;
  items?: Array<{ units?: number }>;
};

const SUBSCRIPTION_EVENT_STATUS: Record<string, string> = {
  "subscription.active": "active",
  "subscription.trialing": "trialing",
  "subscription.paid": "active",
  "subscription.scheduled_cancel": "scheduled_cancel",
  "subscription.canceled": "canceled",
  "subscription.past_due": "past_due",
  "subscription.expired": "expired",
  "subscription.paused": "paused",
};

function normalizeCreemObject(
  type: string,
  object: CreemWebhookObject,
): BillingWebhookObject {
  // `undefined` means "the event said nothing about this field" (keep the
  // stored value); `null` means "the event explicitly cleared it".
  const periodEnd =
    object.current_period_end_date !== undefined
      ? object.current_period_end_date
      : object.currentPeriodEndDate;
  const canceledAt =
    object.canceled_at !== undefined
      ? object.canceled_at
      : object.canceledAt;

  return {
    workspaceId: object.metadata?.workspaceId ?? null,
    subscriptionId: object.id ?? object.subscription?.id ?? null,
    customerId: object.customer?.id ?? object.subscription?.customer?.id ?? null,
    productId: object.product?.id ?? object.subscription?.product?.id ?? null,
    status:
      object.status ?? SUBSCRIPTION_EVENT_STATUS[type] ?? null,
    currentPeriodEnd: periodEnd,
    canceledAt: canceledAt,
    seats: object.items?.[0]?.units ?? null,
    metadata: object.metadata ?? object.subscription?.metadata ?? null,
  };
}

export async function verifyCreemWebhookEvent(
  rawBody: string,
  headers: Record<string, string | string[] | undefined>,
): Promise<BillingWebhookEvent> {
  const parsed = await constructWebhookEvent<CreemWebhookObject>(
    rawBody,
    headers,
    creemWebhookSecret(),
  );

  return {
    id: parsed.id,
    type: parsed.type,
    data: normalizeCreemObject(parsed.type, parsed.data),
  };
}
