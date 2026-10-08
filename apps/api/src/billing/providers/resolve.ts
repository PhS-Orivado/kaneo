import { billingProvider } from "../config";
import { creemProvider } from "./creem/client";
import { stripeProvider } from "./stripe/client";
import type { PaymentProvider } from "./types";

/**
 * Resolve the instance's active payment provider. Exactly one provider runs
 * per instance (BILLING_PROVIDER, default `creem`); controllers depend only
 * on the returned interface, never on a provider SDK.
 */
export function resolvePaymentProvider(): PaymentProvider {
  return billingProvider() === "stripe" ? stripeProvider : creemProvider;
}
