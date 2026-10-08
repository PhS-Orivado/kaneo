import { describe, expect, it } from "vite-plus/test";
import { normalizeStripeEvent } from "../../../apps/api/src/billing/providers/stripe/webhook";

const WORKSPACE = "workspace-1";

function checkoutSessionCompleted(
  overrides: Record<string, unknown> = {},
) {
  return {
    id: "evt_checkout",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_test_1",
        customer: "cus_123",
        subscription: "sub_123",
        client_reference_id: "fallback-workspace",
        metadata: {
          workspaceId: WORKSPACE,
          plan: "team",
          interval: "monthly",
          priceId: "price_tm",
        },
        ...overrides,
      },
    },
  };
}

function subscriptionUpdated(overrides: Record<string, unknown> = {}) {
  return {
    id: "evt_sub_updated",
    type: "customer.subscription.updated",
    data: {
      object: {
        id: "sub_123",
        status: "active",
        cancel_at_period_end: false,
        canceled_at: null,
        current_period_end: 1_800_000_000,
        items: {
          data: [
            {
              quantity: 5,
              current_period_end: 1_800_000_000,
              price: { id: "price_tm" },
            },
          ],
        },
        metadata: { workspaceId: WORKSPACE },
        customer: "cus_123",
        ...overrides,
      },
    },
  };
}

describe("normalizeStripeEvent", () => {
  it("maps checkout.session.completed into checkout.completed", () => {
    const event = normalizeStripeEvent(checkoutSessionCompleted());

    expect(event).toEqual({
      id: "evt_checkout",
      type: "checkout.completed",
      data: {
        workspaceId: WORKSPACE,
        subscriptionId: "sub_123",
        customerId: "cus_123",
        productId: "price_tm",
        status: "active",
        metadata: {
          workspaceId: WORKSPACE,
          plan: "team",
          interval: "monthly",
          priceId: "price_tm",
        },
      },
    });
  });

  it("falls back to client_reference_id for the workspace", () => {
    const raw = checkoutSessionCompleted({ metadata: null });

    const event = normalizeStripeEvent(raw);
    expect(event.data.workspaceId).toBe("fallback-workspace");
  });

  it("maps an active subscription with seats and period end", () => {
    const event = normalizeStripeEvent(subscriptionUpdated());

    expect(event.type).toBe("subscription.active");
    expect(event.data).toEqual({
      workspaceId: WORKSPACE,
      subscriptionId: "sub_123",
      customerId: "cus_123",
      productId: "price_tm",
      status: "active",
      currentPeriodEnd: new Date(1_800_000_000_000).toISOString(),
      canceledAt: null,
      seats: 5,
      metadata: { workspaceId: WORKSPACE },
    });
  });

  it("reads the period end from the subscription item on newer API versions", () => {
    const raw = subscriptionUpdated({ current_period_end: null });

    const event = normalizeStripeEvent(raw);
    expect(event.data.currentPeriodEnd).toBe(
      new Date(1_800_000_000_000).toISOString(),
    );
  });

  it("reports scheduled cancel while the subscription is still active", () => {
    const event = normalizeStripeEvent(
      subscriptionUpdated({ cancel_at_period_end: true }),
    );

    expect(event.type).toBe("subscription.scheduled_cancel");
    expect(event.data.status).toBe("scheduled_cancel");
  });

  it("keeps unpaid subscriptions recoverable as past_due", () => {
    const event = normalizeStripeEvent(subscriptionUpdated({ status: "unpaid" }));

    expect(event.type).toBe("subscription.past_due");
    expect(event.data.status).toBe("past_due");
  });

  it("maps customer.subscription.deleted to subscription.expired", () => {
    const base = subscriptionUpdated({ status: "canceled" });
    const raw = {
      ...base,
      id: "evt_deleted",
      type: "customer.subscription.deleted",
    };

    const event = normalizeStripeEvent(raw);
    expect(event.type).toBe("subscription.expired");
    expect(event.data.status).toBe("expired");
  });

  it("maps invoice events onto the subscription state machine", () => {
    const paid = normalizeStripeEvent({
      id: "evt_inv_paid",
      type: "invoice.paid",
      data: { object: { subscription: "sub_123" } },
    });
    expect(paid).toEqual({
      id: "evt_inv_paid",
      type: "subscription.active",
      data: { subscriptionId: "sub_123", status: "active" },
    });

    const failed = normalizeStripeEvent({
      id: "evt_inv_failed",
      type: "invoice.payment_failed",
      data: { object: { subscription: { id: "sub_123" } } },
    });
    expect(failed.type).toBe("subscription.past_due");
    expect(failed.data.subscriptionId).toBe("sub_123");
  });

  it("passes unknown event types through untouched", () => {
    const event = normalizeStripeEvent({
      id: "evt_other",
      type: "customer.created",
      data: { object: { id: "cus_123" } },
    });

    expect(event).toEqual({
      id: "evt_other",
      type: "customer.created",
      data: {},
    });
  });
});
