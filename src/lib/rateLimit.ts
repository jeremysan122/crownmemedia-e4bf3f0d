/**
 * Rate-limit response helpers.
 *
 * Server-side `public.enforce_rate_limit(...)` raises SQLSTATE `P0001` with:
 *   MESSAGE = "You're doing that too fast. Try again soon."
 *   HINT    = "rate_limit:<action_key>"
 *
 * We detect that shape here so callers can surface a consistent friendly
 * message and skip logging the raw error as a bug.
 */

export const RATE_LIMIT_FRIENDLY_MESSAGE =
  "You're doing that too fast. Try again soon.";

export function isRateLimitError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; message?: string; hint?: string; details?: string };
  if (typeof e.hint === "string" && e.hint.startsWith("rate_limit:")) return true;
  const msg = (e.message ?? "") + " " + (e.details ?? "");
  return /you're doing that too fast/i.test(msg);
}

export function rateLimitAction(err: unknown): string | null {
  if (!err || typeof err !== "object") return null;
  const hint = (err as { hint?: string }).hint;
  if (typeof hint === "string" && hint.startsWith("rate_limit:")) {
    return hint.slice("rate_limit:".length);
  }
  return null;
}
