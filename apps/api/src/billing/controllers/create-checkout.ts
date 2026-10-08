import { createId } from "@paralleldrive/cuid2";
import { count, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { workspaceUserTable } from "../../database/schema";
import {
  type BillingInterval,
  isBillingEnabled,
  type Plan,
  productIdFor,
} from "../config";
import { resolvePaymentProvider } from "../providers/resolve";
import { getOrCreateWorkspaceBilling } from "./get-workspace-billing";

async function createCheckout({
  workspaceId,
  plan,
  interval,
  userEmail,
}: {
  workspaceId: string;
  plan: Plan;
  interval: BillingInterval;
  userEmail: string;
}) {
  if (!isBillingEnabled()) {
    throw new HTTPException(400, { message: "Billing is not enabled" });
  }

  const productId = productIdFor(plan, interval);
  if (!productId) {
    throw new HTTPException(400, { message: "Unknown plan" });
  }

  const billing = await getOrCreateWorkspaceBilling(workspaceId);
  if (billing.status === "active") {
    throw new HTTPException(400, {
      message: "Workspace already has an active subscription",
    });
  }

  let seats = 1;
  if (plan === "team") {
    const [members] = await db
      .select({ value: count() })
      .from(workspaceUserTable)
      .where(eq(workspaceUserTable.workspaceId, workspaceId));
    seats = Math.max(1, members?.value ?? 1);
  }

  const clientUrl = process.env.KANEO_CLIENT_URL ?? "";
  const { checkoutUrl } = await resolvePaymentProvider().createCheckoutSession({
    productId,
    seats,
    successUrl: `${clientUrl}/dashboard/settings/workspace/billing?checkout=success`,
    requestId: createId(),
    customerEmail: userEmail,
    metadata: { workspaceId, plan, interval, priceId: productId },
  });

  return { checkoutUrl };
}

export default createCheckout;
