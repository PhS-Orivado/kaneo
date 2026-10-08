import { createHmac, timingSafeEqual } from "node:crypto";

// Jira does not sign webhook deliveries itself; automation rules can. The
// signature travels in the standard GitHub-style HMAC headers.
export function verifyJiraSignature(
  payload: string,
  secret: string,
  signatureHeader: string | undefined,
): boolean {
  if (!signatureHeader || !secret) {
    return false;
  }

  let provided = signatureHeader.trim();
  if (provided.toLowerCase().startsWith("sha256=")) {
    provided = provided.slice(7);
  }

  const expected = createHmac("sha256", secret).update(payload).digest("hex");

  try {
    const a = Buffer.from(provided, "hex");
    const b = Buffer.from(expected, "hex");
    if (a.length !== b.length) {
      return false;
    }
    return timingSafeEqual(a, b);
  } catch {
    return provided === expected;
  }
}

// Plain Jira webhook registrations cannot sign anything; the literal secret
// header covers them. Compared in constant time.
export function safeSecretEqual(
  provided: string | undefined,
  secret: string,
): boolean {
  if (!provided || !secret) {
    return false;
  }
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  if (a.length !== b.length || a.length === 0) {
    return false;
  }
  return timingSafeEqual(a, b);
}
