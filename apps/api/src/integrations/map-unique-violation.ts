import { HTTPException } from "hono/http-exception";

// RFC 0001 WP2/WP3/WP4: shared insert-conflict mapping for repository
// bindings. A violation of the per-project unique constraint becomes a 409
// with the machine-readable code `repository_already_linked`; any other
// constraint re-throws unchanged so a genuine failure stays a 500 (RFC risk
// table, row 1).

export const INTEGRATION_PROJECT_TYPE_REPO_UNIQUE =
  "integration_project_type_repo_unique";

type PostgresUniqueViolation = Error & {
  code?: string;
  constraint?: string;
};

/**
 * Drizzle >= 0.45 wraps failed queries in `DrizzleQueryError` and keeps the
 * driver's error on `cause`, so the `23505` code and constraint are not on
 * the top-level error. Walk the cause chain and return the first node that
 * carries a unique-violation code; both wrapped and unwrapped shapes work.
 */
function uniqueViolationOf(error: unknown): PostgresUniqueViolation | null {
  let current: unknown = error;
  for (
    let depth = 0;
    depth < 5 && typeof current === "object" && current !== null;
    depth += 1
  ) {
    if ((current as PostgresUniqueViolation).code === "23505") {
      return current as PostgresUniqueViolation;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return null;
}

export function isDatabaseUniqueViolation(
  error: unknown,
): error is PostgresUniqueViolation {
  return uniqueViolationOf(error) !== null;
}

/**
 * Map a caught insert error on the integration table to its API response.
 * `projectId` and `type` are echoed back so clients can render context.
 */
export function mapIntegrationUniqueViolation(
  error: unknown,
  context?: { projectId?: string; type?: string },
): never {
  const violation = uniqueViolationOf(error);
  if (
    !violation ||
    violation.constraint !== INTEGRATION_PROJECT_TYPE_REPO_UNIQUE
  ) {
    throw error;
  }
  throw new HTTPException(409, {
    message: "Repository is already linked to this project",
    res: Response.json(
      {
        code: "repository_already_linked",
        message: "Repository is already linked to this project",
        ...(context?.projectId !== undefined
          ? { projectId: context.projectId }
          : {}),
        ...(context?.type !== undefined ? { type: context.type } : {}),
      },
      { status: 409 },
    ),
  });
}
