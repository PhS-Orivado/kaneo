import { HTTPException } from "hono/http-exception";
import type { LimitDimension } from "../billing/plans";

/**
 * Generalized plan-limit error. Every dimension refuses with HTTP 402 and the
 * same machine-readable body, mirroring the WP10 repository binding quota:
 *   { code: "limit_exceeded", dimension, used, limit }
 * `dimension` uses the plan catalog vocabulary; `used` is null when a single
 * number cannot describe the current usage (never for the enforced guards).
 */
export class LimitExceededError extends HTTPException {
  readonly dimension: LimitDimension;
  readonly used: number | null;
  readonly limit: number;

  constructor(input: {
    dimension: LimitDimension;
    used?: number | null;
    limit: number;
    message: string;
  }) {
    super(402, {
      res: Response.json(
        {
          code: "limit_exceeded",
          dimension: input.dimension,
          used: input.used ?? null,
          limit: input.limit,
        },
        { status: 402 },
      ),
      message: input.message,
    });
    this.dimension = input.dimension;
    this.used = input.used ?? null;
    this.limit = input.limit;
  }
}
