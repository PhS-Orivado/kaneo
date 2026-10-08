# Stripe Payment Hub and Plan-Based Limits — Requirements

Status: Draft for review
Date: 2026-10-08
Scope: `apps/api/src/billing`, `apps/api/src/plan-limits`, `apps/api/src/database`, `apps/web` (billing settings), `apps/docs`, `.env.sample`

## 1. Purpose

This document specifies the requirements for two related capabilities:

1. A provider-agnostic billing layer (the "payment hub") that supports Stripe as an additional payment provider alongside the existing Creem integration.
2. Plan definitions that are characterized by five limit dimensions — number of users, number of projects, number of repositories, storage, and number of integrations — with enforcement and usage visibility for each dimension.

## 2. Background — current state

Kaneo Cloud billing is currently Creem-only and is gated by `isCloud()` plus provider credentials (`apps/api/src/billing/config.ts`). The relevant components are:

| Component | Role |
| --- | --- |
| `apps/api/src/billing/config.ts` | Plan (`personal`, `team`) and interval (`monthly`, `annual`) types; Creem product IDs resolved from environment (`CREEM_PRODUCT_*`); `isBillingEnabled()` |
| `apps/api/src/billing/creem-client.ts` | Checkout session creation, seat (units) update, customer portal link |
| `apps/api/src/billing/index.ts` | Billing routes: `POST /webhook`, `GET /{workspaceId}`, `POST /{workspaceId}/checkout`, `POST /{workspaceId}/portal`; owner/admin authorization via `requireBillingManager` |
| `apps/api/src/billing/controllers/create-checkout.ts` | Creates a checkout session; the team plan is priced per seat (member count) |
| `apps/api/src/billing/controllers/handle-webhook.ts` | Normalized event handling: `checkout.completed`, `subscription.*`; idempotent per event id via the `billing_event` table |
| `apps/api/src/billing/controllers/get-workspace-billing.ts` | Trial grants (per-email hash), founding-free handling, entitlement computation |
| `apps/api/src/billing/controllers/sync-seats.ts` | Pushes the workspace member count as subscription units |
| `apps/api/src/billing/require-entitlement-middleware.ts` | Blocks workspace requests without an active entitlement when billing is enabled; no-op when billing is disabled |
| `apps/api/src/plan-limits/resolve-limits.ts` | Repository binding limit resolution: `workspace_limit` row → instance env default (`KANEO_MAX_REPOSITORIES_PER_PROJECT`) → unlimited |
| `apps/api/src/plan-limits/repository-binding-quota.ts` | Quota enforcement with HTTP 402 (`binding_limit_exceeded`) and the conversion event `integration.binding_quota_exceeded` |

Database tables (`apps/api/src/database/schema.ts`):

| Table | Current shape |
| --- | --- |
| `workspace_billing` | One row per workspace; Creem-specific columns `creem_customer_id`, `creem_subscription_id`, `creem_product_id`; `plan`, `billing_interval`, `status`, `seats`, `current_period_end`, `canceled_at`, `trial_ends_at`, `founding_free` |
| `workspace_limit` | Per-workspace limit overrides written by billing; today only `max_repositories_per_project` |
| `trial_grant` | Per-email-hashed trial identity |
| `billing_event` | Webhook event idempotency ledger (event id primary key) |

Established design contracts that must be preserved:

- A workspace has at most one subscription; entitlement is derived from `workspace_billing`.
- Billing writes limit values; the API only reads them (no direct process coupling).
- Limit resolution order: workspace override → instance default → unlimited.
- Self-hosted instances have billing disabled and therefore no limits.

## 3. Goals

- G1 — Provider abstraction: all billing flows (checkout, portal, seat sync, webhooks) depend on a provider-agnostic interface, not on the Creem SDK.
- G2 — Stripe provider: Stripe can be selected as the payment provider for a cloud instance with feature parity to Creem (checkout, customer portal, seat sync, subscription webhooks, trial handling).
- G3 — Plan-based limits: each plan is defined by limits on users, projects, repositories, storage, and integrations, in addition to the existing per-project repository quota.
- G4 — Enforcement: every limit dimension is enforced at the relevant write path with a consistent, machine-readable error contract.
- G5 — Usage visibility: workspaces can see current usage and limits per dimension, and the web app can drive upgrade prompts.
- G6 — Compatibility: self-hosted instances and existing Creem deployments continue to work without behavior changes.

## 4. Non-goals

- Running two providers simultaneously on one instance (a single active provider per instance).
- Metered or overage billing (for example, pay-per-GB storage beyond the plan quota).
- Changing Creem behavior or pricing.
- Self-hosted billing (billing remains cloud-only).
- Automated migration of existing Creem subscribers to Stripe (cutover is an operational task).
- New plans beyond `personal` and `team` (the catalog must be extensible, but new tiers are out of scope).

## 5. Terminology

- Payment hub: the provider-agnostic billing layer (interfaces, controllers, webhook normalization, entitlement logic).
- Provider: an adapter implementing the hub interface; initially `creem` and `stripe`.
- Plan: a named product tier (`personal`, `team`) with a monthly and annual variant.
- Limit dimension: one of `users`, `projects`, `repositoriesPerProject`, `repositories`, `storage`, `integrations`.
- Entitlement: whether a workspace may use the product (trial, founding-free, or active subscription).

## 6. Functional requirements

### 6.1 Payment hub (provider abstraction)

- FR-1.1 — A `PaymentProvider` interface must exist with at least the following operations:
  - `createCheckoutSession({ plan, interval, seats, customerEmail, successUrl, metadata }) → { checkoutUrl }`
  - `createCustomerPortalLink(customerId) → { portalUrl }`
  - `updateSubscriptionSeats({ subscriptionId, priceId, seats })`
  - `verifyWebhookEvent(rawBody, signatureHeader) → BillingWebhookEvent` (normalized) or rejection
- FR-1.2 — Exactly one active provider per instance, selected by the environment variable `BILLING_PROVIDER` (`creem` | `stripe`). The default must be `creem` so that existing deployments are unaffected.
- FR-1.3 — `isBillingEnabled()` must evaluate the credentials of the selected provider only.
- FR-1.4 — Billing controllers and routes must depend solely on the hub interface; no controller may import a provider SDK.
- FR-1.5 — Webhook endpoints must be provider-specific (`/webhook/creem`, `/webhook/stripe`). The existing Creem webhook path must remain accepted during a transition window for replay tolerance.
- FR-1.6 — Normalized webhook events must use the internal event vocabulary already defined in `handle-webhook.ts` (`checkout.completed`, `subscription.active`, `subscription.trialing`, `subscription.past_due`, `subscription.scheduled_cancel`, `subscription.canceled`, `subscription.expired`, `subscription.paused`) so that downstream state updates remain provider-independent.

### 6.2 Stripe provider

- FR-2.1 — Configuration via environment:
  - `STRIPE_SECRET_KEY` (test mode is implied by a `sk_test_...` key; no separate test flag)
  - `STRIPE_WEBHOOK_SECRET`
  - `STRIPE_PRICE_PERSONAL_MONTHLY`, `STRIPE_PRICE_PERSONAL_ANNUAL`
  - `STRIPE_PRICE_TEAM_MONTHLY`, `STRIPE_PRICE_TEAM_ANNUAL`
- FR-2.2 — Checkout must create a Stripe Checkout Session in `subscription` mode with:
  - one line item using the plan price; quantity equals seats (team plan) or 1 (personal plan)
  - `subscription_data.metadata = { workspaceId, plan, interval }`
  - `customer_email` from the requesting user
  - `client_reference_id = workspaceId`
  - `success_url` and `cancel_url` pointing at the existing billing settings route, with a `checkout=success` query preserved
- FR-2.3 — Webhook events handled and normalized:
  - `checkout.session.completed` → `checkout.completed`
  - `customer.subscription.created` / `customer.subscription.updated` → mapped by Stripe status (`active`, `trialing`, `past_due`, `canceled`, `unpaid`, `paused`) to the internal status vocabulary
  - `customer.subscription.deleted` → `subscription.expired` (entitlement revocation)
  - `invoice.paid` → period end refresh
  - `invoice.payment_failed` → `subscription.past_due`
- FR-2.4 — Webhook signature verification via `stripe.webhooks.constructEvent` with `STRIPE_WEBHOOK_SECRET`; verification failure must return HTTP 400 and must not modify state.
- FR-2.5 — Customer portal via Stripe Billing Portal sessions; the portal configuration (including cancel behavior) is maintained in the Stripe dashboard; the return URL is the billing settings page.
- FR-2.6 — Seat sync updates the subscription item quantity. The proration behavior must be configurable (`STRIPE_SEAT_PRORATION` = `always_invoice` (default, immediate charge, matching Creem `proration-charge`) | `create_prorations` | `none`).
- FR-2.7 — Idempotency: Stripe event ids are recorded in the existing `billing_event` ledger; replays are ignored.
- FR-2.8 — All Stripe identifiers (customer id, subscription id, price id) must be persisted in the provider-neutral columns (see FR-4.1).

### 6.3 Plan definitions and limit dimensions

- FR-3.1 — The plan catalog remains `personal` and `team`, each with monthly and annual variants per provider. The catalog must be extensible without schema changes.
- FR-3.2 — Each plan defines the following limits, where `null` means unlimited:

| Dimension | Meaning | Enforcement unit |
| --- | --- | --- |
| `maxUsers` | Maximum workspace members (including the owner) | Count of rows in `workspace_user` for the workspace |
| `maxProjects` | Maximum projects in the workspace | Count of the workspace's projects |
| `maxRepositoriesPerProject` | Existing per-project repository binding quota (retained) | Active git-provider bindings per project (github, gitea, gitlab) |
| `maxRepositories` | Maximum active repository bindings across the workspace | Active git-provider bindings in the workspace |
| `storageBytes` | Maximum aggregate size of stored objects (attachments) per workspace | Sum of object sizes in the storage backend |
| `maxIntegrations` | Maximum active integrations per workspace | Count of active integrations (all types) in the workspace |

- FR-3.3 — The plan catalog is defined in code as the single source of truth (one module). When a subscription becomes active or changes plan, billing writes the plan's limits into the `workspace_limit` row (preserving the "billing writes, API reads" contract).
- FR-3.4 — Limit resolution per dimension, first match wins: `workspace_limit` value → instance default from environment (`KANEO_MAX_USERS_PER_WORKSPACE`, `KANEO_MAX_PROJECTS_PER_WORKSPACE`, `KANEO_MAX_REPOSITORIES_PER_WORKSPACE`, `KANEO_MAX_REPOSITORIES_PER_PROJECT`, `KANEO_MAX_STORAGE_BYTES`, `KANEO_MAX_INTEGRATIONS_PER_WORKSPACE`) → unlimited.
- FR-3.5 — Trial and founding-free workspaces must receive a defined limit set (`trial` limits in the catalog, or instance defaults when unset). The behavior must be explicit, not accidental.
- FR-3.6 — For the seat-based team plan, `maxUsers` is enforced as the purchased seat count. The existing seat sync remains, and the invite path additionally enforces `maxUsers` directly so that over-seat invites are refused before a Creem/Stripe quantity update is attempted.
- FR-3.7 — Upgrades must take effect immediately on `checkout.completed` (limits written with the same transaction that activates the subscription). Downgrades apply at period end when the provider reports the new plan (limits are then re-written); in the interim the previous limits remain in force.

### 6.4 Data model

- FR-4.1 — `workspace_billing` must use provider-neutral columns: `provider`, `customer_id`, `subscription_id`, `product_id` (the latter holding the Creem product id or the Stripe price id). The existing `creem_*` columns are migrated; existing rows are backfilled with `provider = 'creem'`.
- FR-4.2 — `workspace_limit` is extended with nullable columns: `max_users`, `max_projects`, `max_repositories`, `storage_bytes`, `max_integrations`. `max_repositories_per_project` is retained. A NULL column means "no override; use the instance default".
- FR-4.3 — Self-hosted behavior is unchanged: with billing disabled, entitlement is always active and all limits resolve to unlimited unless instance defaults are set explicitly.

### 6.5 Enforcement

- FR-5.1 — Users: workspace invitations and direct member additions must assert `maxUsers` before creating the membership or sending the invitation.
- FR-5.2 — Projects: project creation must assert `maxProjects`.
- FR-5.3 — Repositories: the existing per-project quota is retained; a new workspace-level total is enforced at binding creation and at reactivation.
- FR-5.4 — Storage: upload initiation (presigned upload flow) must assert `storageBytes`: current workspace usage plus the new object size must not exceed the limit. Usage is reconciled asynchronously against the storage backend.
- FR-5.5 — Integrations: integration creation and reactivation (`isActive` false → true) must assert `maxIntegrations`, counting active integrations of all types in the workspace.
- FR-5.6 — Errors: all limit violations return HTTP 402 with the body `{ code, dimension, used, limit }` (for example `limit_exceeded`). The existing `binding_limit_exceeded` code is retained as an alias for compatibility with existing clients.
- FR-5.7 — Events: each refused operation publishes a conversion event (`limit_exceeded` with the dimension), mirroring the existing `integration.binding_quota_exceeded` mechanism.
- FR-5.8 — Race tolerance: a transient overshoot under concurrent requests is acceptable for billing guards, consistent with the documented approach in `repository-binding-quota.ts`; storage additionally reconciles after upload.

### 6.6 Usage reporting and web app

- FR-6.1 — The workspace billing response must include, for each dimension, the current usage, the effective limit, and whether the limit is enforced. Alternatively a dedicated usage endpoint may be introduced; either way the web app must be able to render usage meters.
- FR-6.2 — The web billing settings page must work identically with both providers: plan selection, checkout redirect, portal link, trial state, and seat count.
- FR-6.3 — When an operation fails with HTTP 402, the web app must present an upgrade prompt naming the exceeded dimension.
- FR-6.4 — Billing routes remain excluded from the published self-hosted OpenAPI reference (existing `hide` behavior).

### 6.7 Configuration and documentation

- FR-7.1 — `.env.sample` documents all new variables with the same comment style as existing entries.
- FR-7.2 — Cloud documentation (`apps/docs`) describes provider setup for Creem and Stripe, including webhook endpoint configuration and required Stripe dashboard settings (prices, portal configuration).
- FR-7.3 — The provider selection and all limit defaults are documented in one place (the billing configuration reference).

## 7. Non-functional requirements

- NFR-1 Security: webhook endpoints are excluded from session authentication but must verify provider signatures; provider secrets must never appear in logs or API responses; billing mutations continue to require workspace owner/admin roles.
- NFR-2 Idempotency and ordering: webhook replays are deduplicated via `billing_event`; subscription state updates are last-write-wins with `updated_at` tracking.
- NFR-3 Performance: limit resolution uses single-row primary-key lookups on `workspace_limit`; storage usage must be read from a maintained aggregate (counter or cached sum), never a full object scan on each upload; target p95 overhead per enforcement check below 10 ms.
- NFR-4 Compatibility: existing billing API responses keep their current field names for at least one release; renamed internals are aliased where necessary.
- NFR-5 Observability: provider request failures log the provider name and request id; conversion events are published for analytics; Sentry spans cover provider calls.
- NFR-6 Testability: provider adapters are unit-tested against recorded webhook payloads; each enforcement point has integration tests; limit resolution has table-driven tests.

## 8. Acceptance criteria

1. With `BILLING_PROVIDER=stripe` and Stripe credentials set, a workspace owner can complete a subscription checkout for each plan and interval, and the workspace entitlement becomes active on `checkout.session.completed`.
2. With `BILLING_PROVIDER=creem` (default), all existing billing behavior is unchanged, including the legacy webhook path.
3. Stripe webhook replays (same event id) do not change state twice.
4. A Stripe subscription cancellation revokes the entitlement at period end, and immediate deletion revokes it immediately.
5. Seat changes (invite/remove) update the Stripe subscription quantity according to `STRIPE_SEAT_PRORATION` and are refused first by the `maxUsers` limit.
6. Each of the six limit dimensions is enforced at its write path with HTTP 402 and a `limit_exceeded` body containing the dimension, used, and limit values.
7. The billing settings page renders usage and limits for all dimensions and an upgrade prompt on a 402 response.
8. Limits take effect immediately after checkout completes, without requiring an API restart.
9. A self-hosted instance with no billing configuration shows no limits and no billing UI, exactly as today.
10. Unit and integration test suites pass with both provider configurations in test mode.

## 9. Open questions

1. Should the workspace-level repository cap (`maxRepositories`) exist in addition to the per-project quota, or should the per-project quota be the only repository dimension?
2. Which limit set applies during trial: the trialed plan's limits, or a dedicated trial tier?
3. What is the desired default for `STRIPE_SEAT_PRORATION` at launch?
4. Storage: block uploads hard at the limit, or allow a small grace margin and warn?
5. Should instance-level limit defaults be set per environment variable (as proposed) or via a single configuration document/env file parsed at startup?
