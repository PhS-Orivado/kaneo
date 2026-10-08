import { isCloud } from "../utils/is-cloud";

export type Plan = "personal" | "team";
export type BillingInterval = "monthly" | "annual";
export type BillingProviderName = "creem" | "stripe";

/**
 * Payment hub: the instance runs exactly one payment provider. The default is
 * `creem` so existing deployments are unaffected; `stripe` is selected with
 * BILLING_PROVIDER=stripe plus the STRIPE_* credentials below.
 */
export function billingProvider(): BillingProviderName {
  const raw = process.env.BILLING_PROVIDER?.trim().toLowerCase();
  if (raw === "stripe") return "stripe";
  return "creem";
}

export function isBillingEnabled() {
  if (!isCloud()) {
    return false;
  }
  return billingProvider() === "stripe"
    ? Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET)
    : Boolean(process.env.CREEM_API_KEY && process.env.CREEM_WEBHOOK_SECRET);
}

// --- Creem -----------------------------------------------------------------

export function creemApiBaseUrl() {
  return process.env.CREEM_TEST_MODE === "true"
    ? "https://test-api.creem.io"
    : "https://api.creem.io";
}

export function creemApiKey() {
  return process.env.CREEM_API_KEY ?? "";
}

export function creemWebhookSecret() {
  return process.env.CREEM_WEBHOOK_SECRET ?? "";
}

// --- Stripe ----------------------------------------------------------------

export function stripeSecretKey() {
  return process.env.STRIPE_SECRET_KEY ?? "";
}

export function stripeWebhookSecret() {
  return process.env.STRIPE_WEBHOOK_SECRET ?? "";
}

/**
 * How a seat change invoices the customer. `always_invoice` charges the
 * prorated difference immediately (parity with Creem's `proration-charge`);
 * `create_prorations` adds it to the next invoice; `none` never prorates.
 */
export function stripeSeatProration(): "always_invoice" | "create_prorations" | "none" {
  const raw = process.env.STRIPE_SEAT_PRORATION?.trim().toLowerCase();
  if (raw === "create_prorations" || raw === "none") {
    return raw;
  }
  return "always_invoice";
}

// --- Shared plan configuration ----------------------------------------------

export function trialDays() {
  const parsed = Number.parseInt(process.env.BILLING_TRIAL_DAYS ?? "14", 10);
  return Number.isNaN(parsed) ? 14 : parsed;
}

export function foundingCutoff(): Date | null {
  const raw = process.env.BILLING_FOUNDING_CUTOFF;
  if (!raw) {
    return null;
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

const PRODUCT_ENV_KEYS: Record<
  BillingProviderName,
  Record<Plan, Record<BillingInterval, string>>
> = {
  creem: {
    personal: {
      monthly: "CREEM_PRODUCT_PERSONAL_MONTHLY",
      annual: "CREEM_PRODUCT_PERSONAL_ANNUAL",
    },
    team: {
      monthly: "CREEM_PRODUCT_TEAM_MONTHLY",
      annual: "CREEM_PRODUCT_TEAM_ANNUAL",
    },
  },
  stripe: {
    personal: {
      monthly: "STRIPE_PRICE_PERSONAL_MONTHLY",
      annual: "STRIPE_PRICE_PERSONAL_ANNUAL",
    },
    team: {
      monthly: "STRIPE_PRICE_TEAM_MONTHLY",
      annual: "STRIPE_PRICE_TEAM_ANNUAL",
    },
  },
};

export function productIdFor(
  plan: Plan,
  interval: BillingInterval,
): string | null {
  return (
    process.env[PRODUCT_ENV_KEYS[billingProvider()][plan][interval]] ?? null
  );
}

export function planForProductId(
  productId: string,
): { plan: Plan; interval: BillingInterval } | null {
  const provider = billingProvider();
  for (const plan of ["personal", "team"] as const) {
    for (const interval of ["monthly", "annual"] as const) {
      if (process.env[PRODUCT_ENV_KEYS[provider][plan][interval]] === productId) {
        return { plan, interval };
      }
    }
  }
  return null;
}
