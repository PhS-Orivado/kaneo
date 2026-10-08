import { eq } from "drizzle-orm";
import db from "../../database";
import {
  billingEventTable,
  workspaceBillingTable,
} from "../../database/schema";
import { planForProductId } from "../config";
import { planLimitsFor, writeWorkspaceLimits } from "../plans";
import type { BillingWebhookEvent } from "../providers/types";

export type { BillingWebhookEvent } from "../providers/types";

type DbOrTx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

function parseDate(value: string | null | undefined) {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Translate a normalized webhook event into workspace_billing updates. The
 * provider adapters have already mapped their payload into the neutral
 * BillingWebhookObject shape, so no provider-specific fields appear here.
 */
export function buildSubscriptionUpdates(event: BillingWebhookEvent) {
  const object = event.data;
  const productId = object.productId ?? null;
  const mapped = productId ? planForProductId(productId) : null;

  const updates: Partial<typeof workspaceBillingTable.$inferInsert> = {
    status: object.status ?? undefined,
  };

  if (object.currentPeriodEnd !== undefined) {
    updates.currentPeriodEnd = parseDate(object.currentPeriodEnd);
  }
  if (object.canceledAt !== undefined) {
    updates.canceledAt = parseDate(object.canceledAt);
  }

  if (productId) {
    updates.productId = productId;
    updates.plan = mapped?.plan ?? null;
    updates.billingInterval = mapped?.interval ?? null;
  }
  if (typeof object.seats === "number" && object.seats > 0) {
    updates.seats = object.seats;
  }
  if (object.customerId) {
    updates.customerId = object.customerId;
  }

  return updates;
}

async function applyEvent(event: BillingWebhookEvent, tx: DbOrTx) {
  const object = event.data;

  if (event.type === "checkout.completed") {
    const workspaceId = object.workspaceId ?? object.metadata?.workspaceId;
    if (!workspaceId) {
      console.error("billing: checkout.completed without workspaceId");
      return { processed: false, duplicate: false };
    }

    const productId = object.productId ?? null;
    const mapped = productId ? planForProductId(productId) : null;
    const plan = mapped?.plan;

    const updates = {
      customerId: object.customerId ?? null,
      subscriptionId: object.subscriptionId ?? null,
      productId,
      plan,
      billingInterval: mapped?.interval ?? null,
      status: object.status ?? "active",
    };

    const updated = await tx
      .update(workspaceBillingTable)
      .set(updates)
      .where(eq(workspaceBillingTable.workspaceId, workspaceId))
      .returning({ id: workspaceBillingTable.id });

    // Limits take effect with the subscription, in the same transaction: the
    // very next request reads the new workspace_limit row.
    if (updated.length > 0 && plan) {
      await writeWorkspaceLimits(workspaceId, planLimitsFor(plan), tx);
    }
    return { processed: true, duplicate: false };
  }

  if (event.type.startsWith("subscription.")) {
    const subscriptionId = object.subscriptionId;
    if (!subscriptionId) {
      return { processed: false, duplicate: false };
    }

    const updates = buildSubscriptionUpdates(event);
    const plan = updates.plan ?? null;

    const updated = await tx
      .update(workspaceBillingTable)
      .set(updates)
      .where(eq(workspaceBillingTable.subscriptionId, subscriptionId))
      .returning({ id: workspaceBillingTable.id });

    const workspaceId = object.workspaceId ?? object.metadata?.workspaceId;
    if (updated.length === 0 && workspaceId) {
      await tx
        .update(workspaceBillingTable)
        .set({ ...updates, subscriptionId })
        .where(eq(workspaceBillingTable.workspaceId, workspaceId));
    }

    // A plan change (upgrade or downgrade reported by the provider) rewrites
    // the workspace limits. `updates.plan` is null when the event carries no
    // product/price id, in which case the previous limits stay in force.
    if (plan && workspaceId) {
      await writeWorkspaceLimits(workspaceId, planLimitsFor(plan), tx);
    }
    return { processed: true, duplicate: false };
  }

  return { processed: true, duplicate: false };
}

async function handleWebhook(event: BillingWebhookEvent) {
  const eventId = event.id;
  if (!eventId) {
    return applyEvent(event, db);
  }

  // A claim that outlives a failed apply makes the retry look like a duplicate.
  return db.transaction(async (tx) => {
    const [claimed] = await tx
      .insert(billingEventTable)
      .values({ id: eventId, eventType: event.type })
      .onConflictDoNothing({ target: billingEventTable.id })
      .returning();

    if (!claimed) {
      return { processed: false, duplicate: true };
    }

    return applyEvent(event, tx);
  });
}

export default handleWebhook;
