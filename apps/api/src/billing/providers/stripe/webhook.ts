import Stripe from "stripe";
import { stripeSecretKey, stripeWebhookSecret } from "../../config";
import type {
  BillingWebhookEvent,
  BillingWebhookObject,
} from "../types";

/**
 * Stripe webhook normalization. The Stripe SDK cannot be assumed present in
 * unit-test environments, so `normalizeStripeEvent` is a pure function over a
 * structurally-typed event: tests feed fixtures directly and only the thin
 * `verifyStripeWebhookEvent` wrapper touches the SDK.
 */

type StripeId = string | { id: string } | null | undefined;

type StripeCheckoutSession = {
  id: string;
  customer?: StripeId;
  subscription?: StripeId;
  client_reference_id?: string | null;
  metadata?: Record<string, string> | null;
};

type StripeSubscription = {
  id: string;
  status: string;
  cancel_at_period_end?: boolean;
  canceled_at?: number | null;
  // `current_period_end` moved to the subscription item in API versions from
  // 2025-04-30.basil onward; read both so the code works with either.
  current_period_end?: number | null;
  items?: {
    data?: Array<{
      quantity?: number | null;
      current_period_end?: number | null;
      price?: { id?: string } | null;
    }>;
  };
  metadata?: Record<string, string> | null;
  customer?: StripeId;
};

type StripeInvoice = {
  subscription?: StripeId;
};

export type MinimalStripeEvent = {
  id: string;
  type: string;
  data: { object: unknown };
};

function resolveId(value: StripeId): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

function unixToIso(seconds: number | null | undefined): string | null {
  if (typeof seconds !== "number") return null;
  return new Date(seconds * 1000).toISOString();
}

const SUBSCRIPTION_STATUS: Record<string, string> = {
  active: "active",
  trialing: "trialing",
  past_due: "past_due",
  // `unpaid` means automatic retries are exhausted but the subscription is
  // not yet deleted; keep it recoverable, like past_due.
  unpaid: "past_due",
  canceled: "canceled",
  paused: "paused",
  incomplete: "paused",
  incomplete_expired: "expired",
};

function normalizeSubscription(
  subscription: StripeSubscription,
): BillingWebhookObject {
  const item = subscription.items?.data?.[0];
  const periodEndUnix =
    subscription.current_period_end ?? item?.current_period_end ?? null;

  const status =
    subscription.cancel_at_period_end && subscription.status === "active"
      ? "scheduled_cancel"
      : (SUBSCRIPTION_STATUS[subscription.status] ?? subscription.status);

  return {
    workspaceId: subscription.metadata?.workspaceId ?? null,
    subscriptionId: subscription.id,
    customerId: resolveId(subscription.customer),
    productId: item?.price?.id ?? null,
    status,
    currentPeriodEnd: unixToIso(periodEndUnix),
    canceledAt: unixToIso(subscription.canceled_at ?? null),
    seats: typeof item?.quantity === "number" ? item.quantity : null,
    metadata: subscription.metadata ?? null,
  };
}

export function normalizeStripeEvent(
  event: MinimalStripeEvent,
): BillingWebhookEvent {
  const object = event.data?.object;

  switch (event.type) {
    case "checkout.session.completed": {
      const session = object as StripeCheckoutSession;
      const metadata = session.metadata ?? null;
      return {
        id: event.id,
        type: "checkout.completed",
        data: {
          workspaceId: metadata?.workspaceId ?? session.client_reference_id ?? null,
          subscriptionId: resolveId(session.subscription),
          customerId: resolveId(session.customer),
          productId: metadata?.priceId ?? null,
          status: "active",
          metadata,
        },
      };
    }

    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const subscription = object as StripeSubscription;
      const data = normalizeSubscription(subscription);
      return {
        id: event.id,
        type: `subscription.${data.status ?? "updated"}`,
        data,
      };
    }

    case "customer.subscription.deleted": {
      const subscription = object as StripeSubscription;
      const data = normalizeSubscription(subscription);
      return {
        id: event.id,
        type: "subscription.expired",
        data: { ...data, status: "expired" },
      };
    }

    case "invoice.paid": {
      const invoice = object as StripeInvoice;
      return {
        id: event.id,
        type: "subscription.active",
        data: {
          subscriptionId: resolveId(invoice.subscription),
          status: "active",
        },
      };
    }

    case "invoice.payment_failed": {
      const invoice = object as StripeInvoice;
      return {
        id: event.id,
        type: "subscription.past_due",
        data: {
          subscriptionId: resolveId(invoice.subscription),
          status: "past_due",
        },
      };
    }

    default:
      return { id: event.id, type: event.type, data: {} };
  }
}

export async function verifyStripeWebhookEvent(
  rawBody: string,
  headers: Record<string, string | string[] | undefined>,
): Promise<BillingWebhookEvent> {
  const signature = headers["stripe-signature"];
  if (!signature || typeof signature !== "string") {
    throw new Error("Missing stripe-signature header");
  }

  const stripe = new Stripe(stripeSecretKey());
  const event = stripe.webhooks.constructEvent(
    rawBody,
    signature,
    stripeWebhookSecret(),
  );

  return normalizeStripeEvent(event as unknown as MinimalStripeEvent);
}
