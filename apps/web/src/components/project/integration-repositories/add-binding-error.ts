import { HttpError } from "@/lib/http-error";

/** RFC 0001 WP10/D2: an add-flow failure rendered inline next to the action. */
export type AddBindingError = {
  message: string;
  /** True when the plan's repository binding limit rejected the request. */
  limitReached: boolean;
};

/**
 * Maps a failed create request to an actionable UI state. The server is the
 * source of truth: a 402 carries the plan's `used`/`limit` summary, a 409 the
 * same-project duplicate message; both are shown with their own words, never
 * a generic failure.
 */
export function parseAddBindingError(error: unknown): AddBindingError | null {
  if (error instanceof HttpError) {
    try {
      const body = JSON.parse(error.message) as {
        code?: string;
        message?: string;
      };
      if (error.status === 402 || body.code === "binding_limit_exceeded") {
        return {
          message: body.message ?? error.message,
          limitReached: true,
        };
      }
      return {
        message: body.message ?? error.message,
        limitReached: false,
      };
    } catch {
      return { message: error.message, limitReached: false };
    }
  }
  if (error instanceof Error && error.message) {
    return { message: error.message, limitReached: false };
  }
  return null;
}
