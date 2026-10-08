import { and, eq, inArray } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../database";
import { workspaceUserTable } from "../database/schema";
import {
  apiRouter,
  type BaseVariables,
  createRoute,
  errorResponse,
  jsonResponse,
} from "../openapi";
import { requireUserSession } from "../utils/require-user-session";
import { validateWorkspaceAccess } from "../utils/validate-workspace-access";
import { billingProvider, isBillingEnabled } from "./config";
import createCheckout from "./controllers/create-checkout";
import getWorkspaceBilling, {
  getOrCreateWorkspaceBilling,
} from "./controllers/get-workspace-billing";
import handleWebhook from "./controllers/handle-webhook";
import { resolvePaymentProvider } from "./providers/resolve";
import type { BillingProviderName } from "./config";
import {
  checkoutSchema,
  portalSchema,
  webhookResultSchema,
  workspaceBillingSchema,
} from "./response";
import { createCheckoutBody, workspaceIdParam } from "./schema";

async function requireBillingManager(userId: string, workspaceId: string) {
  await validateWorkspaceAccess(userId, workspaceId);

  const [member] = await db
    .select({ role: workspaceUserTable.role })
    .from(workspaceUserTable)
    .where(
      and(
        eq(workspaceUserTable.workspaceId, workspaceId),
        eq(workspaceUserTable.userId, userId),
        inArray(workspaceUserTable.role, ["owner", "admin"]),
      ),
    );

  if (!member) {
    throw new HTTPException(403, {
      message: "Only workspace owners and admins can manage billing",
    });
  }
}

// Excluded from the app-wide auth middleware: authenticity comes from the
// provider's webhook signature instead of a session.
// Kaneo Cloud only: still served, but kept out of the published document so the
// self-hosted API reference does not advertise a paid tier that does not exist.
const cloudOnly = { hide: true } as const;

function webhookRoute(path: string, operationId: string) {
  return createRoute({
    ...cloudOnly,
    method: "post",
    operationId,
    path,
    tags: ["Billing"],
    summary: "Billing webhook",
    description:
      "Receive a payment-provider subscription event. Authenticated by the provider's webhook signature, not by a session, and idempotent per event id.",
    security: [],
    responses: {
      200: jsonResponse("The event was accepted", webhookResultSchema),
      400: errorResponse("Signature verification failed"),
      404: errorResponse("Billing is not enabled on this instance"),
    },
  });
}

// `/webhook` is the legacy Creem endpoint, kept for delivery retries during
// the transition to provider-specific paths.
const webhookRouteCreem = webhookRoute("/webhook", "handleBillingWebhook");
const webhookRouteCreemAlias = webhookRoute(
  "/webhook/creem",
  "handleBillingWebhookCreem",
);
const webhookRouteStripe = webhookRoute(
  "/webhook/stripe",
  "handleBillingWebhookStripe",
);

const getWorkspaceBillingRoute = createRoute({
  ...cloudOnly,
  method: "get",
  operationId: "getWorkspaceBilling",
  path: "/{workspaceId}",
  tags: ["Billing"],
  summary: "Get workspace billing",
  description:
    "Get the billing state, entitlement, and plan usage for a workspace. When the instance has no billing configured this reports billingEnabled: false and an always-active entitlement.",
  request: { params: workspaceIdParam },
  responses: {
    200: jsonResponse(
      "Billing state for the workspace",
      workspaceBillingSchema,
    ),
    403: errorResponse("No access to the workspace"),
  },
});

const createCheckoutRoute = createRoute({
  middleware: [requireUserSession] as const,
  ...cloudOnly,
  method: "post",
  operationId: "createBillingCheckout",
  path: "/{workspaceId}/checkout",
  tags: ["Billing"],
  summary: "Create checkout",
  description:
    "Create a checkout session with the instance's payment provider for a workspace plan and return the URL to redirect the browser to. Workspace owners and admins only.",
  request: {
    params: workspaceIdParam,
    body: {
      required: true,
      content: { "application/json": { schema: createCheckoutBody } },
    },
  },
  responses: {
    200: jsonResponse("The checkout session", checkoutSchema),
    400: errorResponse("Invalid plan or interval"),
    403: errorResponse("Not a workspace owner or admin"),
  },
});

const createPortalRoute = createRoute({
  middleware: [requireUserSession] as const,
  ...cloudOnly,
  method: "post",
  operationId: "createBillingPortalSession",
  path: "/{workspaceId}/portal",
  summary: "Create portal session",
  description:
    "Generate a customer portal link with the instance's payment provider for the workspace subscription. Workspace owners and admins only, and only once a billing customer exists.",
  request: { params: workspaceIdParam },
  responses: {
    200: jsonResponse("The portal link", portalSchema),
    400: errorResponse("No billing customer exists for this workspace yet"),
    403: errorResponse("Not a workspace owner or admin"),
  },
});

async function handleProviderWebhook(
  expectedProvider: BillingProviderName,
  rawBody: string,
  headers: Record<string, string | string[] | undefined>,
) {
  if (!isBillingEnabled() || billingProvider() !== expectedProvider) {
    throw new HTTPException(404, { message: "Not found" });
  }

  try {
    const event = await resolvePaymentProvider().verifyWebhookEvent(
      rawBody,
      headers,
    );
    return await handleWebhook(event);
  } catch (error) {
    // Verification failures must never touch state; rethrow as 400.
    if (error instanceof HTTPException) {
      throw error;
    }
    console.error("billing: webhook signature verification failed", error);
    throw new HTTPException(400, { message: "Invalid signature" });
  }
}

const billing = apiRouter<BaseVariables>()
  .openapi(webhookRouteCreem, async (c) => {
    const rawBody = await c.req.text();
    return c.json(
      await handleProviderWebhook("creem", rawBody, c.req.header()),
      200,
    );
  })
  .openapi(webhookRouteCreemAlias, async (c) => {
    const rawBody = await c.req.text();
    return c.json(
      await handleProviderWebhook("creem", rawBody, c.req.header()),
      200,
    );
  })
  .openapi(webhookRouteStripe, async (c) => {
    const rawBody = await c.req.text();
    return c.json(
      await handleProviderWebhook("stripe", rawBody, c.req.header()),
      200,
    );
  })
  .openapi(getWorkspaceBillingRoute, async (c) => {
    const { workspaceId } = c.req.valid("param");
    await validateWorkspaceAccess(c.get("userId"), workspaceId);
    return c.json(await getWorkspaceBilling(workspaceId), 200);
  })
  .openapi(createCheckoutRoute, async (c) => {
    const { workspaceId } = c.req.valid("param");
    const { plan, interval } = c.req.valid("json");
    await requireBillingManager(c.get("userId"), workspaceId);

    return c.json(
      await createCheckout({
        workspaceId,
        plan,
        interval,
        userEmail: c.get("userEmail") ?? "",
      }),
      200,
    );
  })
  .openapi(createPortalRoute, async (c) => {
    const { workspaceId } = c.req.valid("param");
    await requireBillingManager(c.get("userId"), workspaceId);

    const billingRow = await getOrCreateWorkspaceBilling(workspaceId);
    if (!billingRow.customerId) {
      throw new HTTPException(400, {
        message: "No billing customer exists for this workspace yet",
      });
    }

    return c.json(
      await resolvePaymentProvider().createCustomerPortalLink(
        billingRow.customerId,
      ),
      200,
    );
  });

export default billing;
