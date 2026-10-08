import Stripe from "stripe";
import { HTTPException } from "hono/http-exception";
import {
  stripeSecretKey,
  stripeSeatProration,
} from "../../config";
import type { CreateCheckoutInput, PaymentProvider } from "../types";
import { verifyStripeWebhookEvent } from "./webhook";

function stripeClient() {
  return new Stripe(stripeSecretKey());
}

export async function createCheckoutSession(input: CreateCheckoutInput) {
  try {
    const clientUrl = new URL(input.successUrl);
    const cancelUrl = `${clientUrl.origin}${clientUrl.pathname}`;

    const session = await stripeClient().checkout.sessions.create({
      mode: "subscription",
      line_items: [
        {
          price: input.productId,
          quantity: Math.max(1, input.seats),
        },
      ],
      customer_email: input.customerEmail || undefined,
      client_reference_id: input.metadata.workspaceId,
      // Session-level metadata is readable on checkout.session.completed;
      // subscription_data.metadata lands on the subscription and is what
      // later subscription events carry. Both are set to the same values so
      // every event shape can resolve the workspace, plan, and price.
      metadata: input.metadata,
      subscription_data: {
        metadata: input.metadata,
      },
      success_url: input.successUrl,
      cancel_url: cancelUrl,
    });

    if (!session.url) {
      throw new Error("Checkout session has no URL");
    }
    return { checkoutUrl: session.url };
  } catch (error) {
    console.error("Stripe checkout creation failed:", error);
    throw new HTTPException(502, {
      message: "Billing provider request failed",
    });
  }
}

export async function createCustomerPortalLink(customerId: string) {
  try {
    const portal = await stripeClient().billingPortal.sessions.create({
      customer: customerId,
      // Falls back to the portal configuration marked active in the Stripe
      // dashboard; STRIPE_PORTAL_CONFIGURATION_ID pins it explicitly when set.
      configuration:
        process.env.STRIPE_PORTAL_CONFIGURATION_ID || undefined,
      return_url:
        process.env.KANEO_CLIENT_URL
          ? `${process.env.KANEO_CLIENT_URL.replace(/\/$/, "")}/dashboard/settings/workspace/billing`
          : undefined,
    });
    return { portalUrl: portal.url };
  } catch (error) {
    console.error("Stripe portal link creation failed:", error);
    throw new HTTPException(502, {
      message: "Billing provider request failed",
    });
  }
}

export async function updateSubscriptionSeats(input: {
  subscriptionId: string;
  productId: string;
  seats: number;
}) {
  const client = stripeClient();
  const subscription = await client.subscriptions.retrieve(
    input.subscriptionId,
  );

  // The stored product id is the price id the subscription was created with.
  // Match it against the items to update the right one; a single-item
  // subscription is the shape Kaneo sells, so fall back to it.
  const items = subscription.items.data ?? [];
  const item =
    items.find((entry) => entry.price.id === input.productId) ??
    (items.length === 1 ? items[0] : undefined);

  if (!item) {
    throw new Error(
      `Stripe subscription ${input.subscriptionId} has no item for price ${input.productId}`,
    );
  }

  await client.subscriptions.update(input.subscriptionId, {
    items: [{ id: item.id, quantity: Math.max(1, input.seats) }],
    proration_behavior: stripeSeatProration(),
  });
}

export const stripeProvider: PaymentProvider = {
  name: "stripe",
  createCheckoutSession,
  createCustomerPortalLink,
  updateSubscriptionSeats,
  verifyWebhookEvent(rawBody, headers) {
    return verifyStripeWebhookEvent(rawBody, headers);
  },
};
