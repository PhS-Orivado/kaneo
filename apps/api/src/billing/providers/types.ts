import type { BillingProviderName } from "../config";

/**
 * Provider-neutral webhook payload. Adapters translate their provider's event
 * shapes into this vocabulary before `handle-webhook` sees them, so the
 * subscription state machine stays identical for Creem and Stripe.
 *
 * Event types (the same vocabulary the Creem integration already used):
 *   checkout.completed
 *   subscription.active | subscription.trialing | subscription.past_due |
 *   subscription.scheduled_cancel | subscription.canceled |
 *   subscription.expired | subscription.paused | subscription.updated
 */
export interface BillingWebhookObject {
  /** The workspace the event applies to, when the provider can supply it. */
  workspaceId?: string | null;
  /** Provider subscription id (required for subscription.* events). */
  subscriptionId?: string | null;
  customerId?: string | null;
  /** Creem product id or Stripe price id. */
  productId?: string | null;
  /** Status in the internal vocabulary; falls back to the event type. */
  status?: string | null;
  currentPeriodEnd?: string | null;
  canceledAt?: string | null;
  seats?: number | null;
  metadata?: Record<string, string> | null;
}

export interface BillingWebhookEvent {
  id?: string;
  type: string;
  data: BillingWebhookObject;
}

export interface CreateCheckoutInput {
  /** The provider price (Stripe) or product (Creem) id, resolved by the caller. */
  productId: string;
  /** Seat count for per-seat plans; 1 otherwise. */
  seats: number;
  customerEmail: string;
  successUrl: string;
  requestId: string;
  metadata: Record<string, string>;
}

export interface PaymentProvider {
  readonly name: BillingProviderName;
  createCheckoutSession(
    input: CreateCheckoutInput,
  ): Promise<{ checkoutUrl: string }>;
  createCustomerPortalLink(
    customerId: string,
  ): Promise<{ portalUrl: string }>;
  updateSubscriptionSeats(input: {
    subscriptionId: string;
    productId: string;
    seats: number;
  }): Promise<void>;
  /**
   * Verify the provider's webhook signature and normalize the event. Must
   * throw when verification fails; must never trust unsigned payloads.
   */
  verifyWebhookEvent(
    rawBody: string,
    headers: Record<string, string | string[] | undefined>,
  ): Promise<BillingWebhookEvent>;
}
