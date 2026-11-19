import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import db from "../../database";
import { integrationTable } from "../../database/schema";
import { normalizeGiteaBaseUrl } from "../../plugins/gitea/config";

// A project can bind repositories from several Gitea servers at once
// (RFC 0001 WP3: one integration row per repository). When a reconnect
// request omits the token, the saved credential may only be reused from the
// binding row whose normalized destination matches the requested server.
// Scanning all same-project rows and skipping non-matching ones (instead of
// inspecting an arbitrary first row) picks the right binding; a row whose
// stored config is unreadable or points at another server never blocks the
// reconnect, and a stored credential is never forwarded to an edited
// destination.
export async function resolveVerificationToken(input: {
  projectId: string;
  baseUrl: string;
  accessToken?: string;
}) {
  let baseUrl: string;
  try {
    baseUrl = normalizeGiteaBaseUrl(input.baseUrl);
  } catch {
    throw new HTTPException(400, {
      message:
        "Enter a valid HTTP or HTTPS Gitea URL without credentials, a query, or a fragment.",
    });
  }
  if (input.accessToken?.trim()) return input.accessToken.trim();
  const integrations = await db.query.integrationTable.findMany({
    where: and(
      eq(integrationTable.projectId, input.projectId),
      eq(integrationTable.type, "gitea"),
    ),
  });
  for (const integration of integrations) {
    // Legacy or corrupted rows are skipped, not fatal: an unrelated
    // unreadable row must not block reconnecting a healthy binding.
    let parsed: unknown;
    try {
      parsed = JSON.parse(integration.config);
    } catch {
      continue;
    }
    if (typeof parsed !== "object" || parsed === null) continue;
    const config = parsed as { accessToken?: unknown; baseUrl?: unknown };
    if (typeof config.baseUrl !== "string") continue;
    let savedBaseUrl: string;
    try {
      savedBaseUrl = normalizeGiteaBaseUrl(config.baseUrl);
    } catch {
      continue;
    }
    // Never forward a stored credential to an edited destination.
    if (savedBaseUrl !== baseUrl) continue;
    if (typeof config.accessToken !== "string" || !config.accessToken.trim()) {
      continue;
    }
    return config.accessToken;
  }
  throw new HTTPException(400, {
    message: "Enter a personal access token to verify this Gitea instance.",
  });
}
