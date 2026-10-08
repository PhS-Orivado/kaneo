import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import {
  billingProvider,
  foundingCutoff,
  isBillingEnabled,
  planForProductId,
  productIdFor,
  stripeSeatProration,
  trialDays,
} from "../../../apps/api/src/billing/config";

const KEYS = [
  "KANEO_CLOUD",
  "BILLING_PROVIDER",
  "CREEM_API_KEY",
  "CREEM_WEBHOOK_SECRET",
  "CREEM_PRODUCT_PERSONAL_MONTHLY",
  "CREEM_PRODUCT_PERSONAL_ANNUAL",
  "CREEM_PRODUCT_TEAM_MONTHLY",
  "CREEM_PRODUCT_TEAM_ANNUAL",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_PRICE_PERSONAL_MONTHLY",
  "STRIPE_PRICE_PERSONAL_ANNUAL",
  "STRIPE_PRICE_TEAM_MONTHLY",
  "STRIPE_PRICE_TEAM_ANNUAL",
  "STRIPE_SEAT_PRORATION",
  "BILLING_TRIAL_DAYS",
  "BILLING_FOUNDING_CUTOFF",
];

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const key of KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = saved[key];
    }
  }
});

describe("billing config", () => {
  it("is disabled unless cloud + both keys are set", () => {
    expect(isBillingEnabled()).toBe(false);

    process.env.KANEO_CLOUD = "true";
    expect(isBillingEnabled()).toBe(false);

    process.env.CREEM_API_KEY = "key";
    expect(isBillingEnabled()).toBe(false);

    process.env.CREEM_WEBHOOK_SECRET = "secret";
    expect(isBillingEnabled()).toBe(true);
  });

  it("stays disabled for self-hosted even with keys present", () => {
    process.env.CREEM_API_KEY = "key";
    process.env.CREEM_WEBHOOK_SECRET = "secret";
    expect(isBillingEnabled()).toBe(false);
  });

  it("maps plan+interval to product id and back", () => {
    process.env.CREEM_PRODUCT_PERSONAL_MONTHLY = "prod_pm";
    process.env.CREEM_PRODUCT_TEAM_ANNUAL = "prod_ta";

    expect(productIdFor("personal", "monthly")).toBe("prod_pm");
    expect(productIdFor("team", "annual")).toBe("prod_ta");
    expect(productIdFor("personal", "annual")).toBeNull();

    expect(planForProductId("prod_pm")).toEqual({
      plan: "personal",
      interval: "monthly",
    });
    expect(planForProductId("prod_ta")).toEqual({
      plan: "team",
      interval: "annual",
    });
    expect(planForProductId("prod_unknown")).toBeNull();
  });

  it("defaults trial to 14 days and reads override", () => {
    expect(trialDays()).toBe(14);
    process.env.BILLING_TRIAL_DAYS = "30";
    expect(trialDays()).toBe(30);
    process.env.BILLING_TRIAL_DAYS = "not-a-number";
    expect(trialDays()).toBe(14);
  });

  it("defaults to creem and only switches on an explicit value", () => {
    expect(billingProvider()).toBe("creem");
    process.env.BILLING_PROVIDER = "Stripe";
    expect(billingProvider()).toBe("stripe");
    process.env.BILLING_PROVIDER = "unknown";
    expect(billingProvider()).toBe("creem");
  });

  it("enables billing for stripe only with cloud plus both stripe keys", () => {
    process.env.KANEO_CLOUD = "true";
    process.env.BILLING_PROVIDER = "stripe";
    process.env.CREEM_API_KEY = "key";
    process.env.CREEM_WEBHOOK_SECRET = "secret";
    expect(isBillingEnabled()).toBe(false);

    process.env.STRIPE_SECRET_KEY = "sk_test";
    expect(isBillingEnabled()).toBe(false);

    process.env.STRIPE_WEBHOOK_SECRET = "whsec";
    expect(isBillingEnabled()).toBe(true);
  });

  it("maps stripe prices to plans and back", () => {
    process.env.BILLING_PROVIDER = "stripe";
    process.env.STRIPE_PRICE_TEAM_MONTHLY = "price_tm";
    process.env.STRIPE_PRICE_PERSONAL_ANNUAL = "price_pa";

    expect(productIdFor("team", "monthly")).toBe("price_tm");
    expect(productIdFor("personal", "annual")).toBe("price_pa");
    expect(productIdFor("team", "annual")).toBeNull();

    expect(planForProductId("price_tm")).toEqual({
      plan: "team",
      interval: "monthly",
    });
    expect(planForProductId("price_pa")).toEqual({
      plan: "personal",
      interval: "annual",
    });
    expect(planForProductId("price_unknown")).toBeNull();
  });

  it("defaults stripe seat proration to always_invoice", () => {
    expect(stripeSeatProration()).toBe("always_invoice");
    process.env.STRIPE_SEAT_PRORATION = "create_prorations";
    expect(stripeSeatProration()).toBe("create_prorations");
    process.env.STRIPE_SEAT_PRORATION = "none";
    expect(stripeSeatProration()).toBe("none");
    process.env.STRIPE_SEAT_PRORATION = "garbage";
    expect(stripeSeatProration()).toBe("always_invoice");
  });

  it("parses the founding cutoff date, null when unset or invalid", () => {
    expect(foundingCutoff()).toBeNull();
    process.env.BILLING_FOUNDING_CUTOFF = "2026-07-28";
    expect(foundingCutoff()?.getUTCFullYear()).toBe(2026);
    process.env.BILLING_FOUNDING_CUTOFF = "garbage";
    expect(foundingCutoff()).toBeNull();
  });
});
