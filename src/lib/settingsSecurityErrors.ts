/**
 * Friendly error mapper for Settings / Security / Auth / Push / Legal / Export flows.
 *
 * Never let raw Supabase/Postgres/RLS/Auth/Storage/PostgREST/JWT strings reach
 * the UI. Every catch site should call `toFriendlyMessage(err, ctx)` and
 * (optionally) `logRawError(err, ctx)` for diagnostics.
 */
import { supabase } from "@/integrations/supabase/client";
import { isRateLimitError, RATE_LIMIT_FRIENDLY_MESSAGE } from "@/lib/rateLimit";

export type ErrorContext =
  | "settings"
  | "privacy"
  | "blocked_load"
  | "blocked_unblock"
  | "muted"
  | "restricted"
  | "push_enable"
  | "push_disable"
  | "legal"
  | "export"
  | "password"
  | "age"
  | "reset"
  | "login"
  | "signup"
  | "auth"
  | "verification"
  | "notifications"
  | "generic";

const GENERIC_BY_CONTEXT: Record<ErrorContext, string> = {
  settings: "Couldn't update settings. Try again.",
  privacy: "Couldn't update privacy. Try again.",
  blocked_load: "Couldn't load blocked accounts. Try again.",
  blocked_unblock: "Couldn't unblock this account. Try again.",
  muted: "Couldn't update muted words. Try again.",
  restricted: "Couldn't update restricted accounts. Try again.",
  push_enable: "Couldn't enable push notifications. Try again.",
  push_disable: "Couldn't disable push notifications. Try again.",
  legal: "Couldn't record legal acceptance. Try again.",
  export: "Couldn't export your data. Try again.",
  password: "Couldn't update password. Try again.",
  age: "Couldn't verify your age. Try again.",
  reset: "Couldn't send reset email. Try again.",
  login: "Couldn't sign you in. Try again.",
  signup: "Couldn't complete signup. Try again.",
  auth: "Something went wrong. Try again.",
  verification: "Couldn't update verification. Try again.",
  notifications: "Couldn't update notifications. Try again.",
  generic: "Something went wrong. Try again.",
};

// Substrings that indicate a leaky raw backend error. If any of these are
// present in a message, we NEVER return that raw text to the UI.
const LEAKY_PATTERNS: RegExp[] = [
  /permission denied/i,
  /row[- ]level security/i,
  /\bviolates\b/i,
  /PostgREST/i,
  /duplicate key/i,
  /\bJWT\b/i,
  /schema cache/i,
  /pgrst/i,
  /relation .* does not exist/i,
  /column .* does not exist/i,
  /function .* does not exist/i,
  /constraint/i,
  /pg_/i,
  /supabase/i,
  /auth\.users/i,
  /storage\./i,
  /invalid input syntax/i,
];

function messageOf(err: unknown): string {
  if (!err) return "";
  if (typeof err === "string") return err;
  if (typeof err === "object") {
    const e = err as { message?: string; error_description?: string; msg?: string; code?: string };
    return e.message || e.error_description || e.msg || "";
  }
  return String(err);
}

/** True when the raw error text is safe to surface verbatim (whitelist-free). */
function isLeaky(msg: string): boolean {
  if (!msg) return true;
  return LEAKY_PATTERNS.some((rx) => rx.test(msg));
}

/**
 * Map a raw error to a safe, user-facing message. For auth contexts we
 * recognize a handful of well-known cases and return specific copy;
 * everything else collapses to the context-generic message.
 */
export function toFriendlyMessage(err: unknown, ctx: ErrorContext = "generic"): string {
  // Rate-limit errors have consistent friendly copy regardless of context.
  if (isRateLimitError(err)) return RATE_LIMIT_FRIENDLY_MESSAGE;
  const raw = messageOf(err);
  const lower = raw.toLowerCase();

  // ---- Auth-specific known-safe cases ----
  if (ctx === "login" || ctx === "signup") {
    if (/invalid.*login|invalid.*credentials|invalid email or password|invalid_grant/i.test(raw)) {
      return "Invalid email or password.";
    }
    if (/rate|too many|429/i.test(lower)) {
      return "Too many attempts. Try again shortly.";
    }
    if (/not.*confirmed|not.*verified|email.*confirm/i.test(lower)) {
      return "Please confirm your email first.";
    }
    if (/already|registered|exists|duplicate/i.test(lower)) {
      return "An account with this email already exists.";
    }
    if (/18 or older|underage/i.test(lower)) {
      return "You must be 18 or older to register.";
    }
  }

  if (ctx === "reset") {
    if (/rate|too many|429/i.test(lower)) return "Too many attempts. Try again shortly.";
    // Neutral copy is enforced at the call site (to avoid email enumeration).
  }

  if (ctx === "password") {
    if (/at least|too short|min.*(8|char)/i.test(lower)) return "Password must be at least 8 characters.";
    if (/same as|reuse|used before/i.test(lower)) return "Choose a password you haven't used before.";
    if (/rate|too many/i.test(lower)) return "Too many attempts. Try again shortly.";
  }

  if (ctx === "age") {
    if (/18|under.?age/i.test(lower)) return "You must be 18 or older to use CrownMe.";
  }

  if (ctx === "push_enable") {
    if (/permission|denied|not.*granted/i.test(lower) && !isLeaky(raw)) {
      return "Push permission denied. Enable notifications in your browser settings.";
    }
    if (/vapid|not configured/i.test(lower)) return "Push isn't set up on this device.";
  }

  // ---- Fall through to context-generic ----
  return GENERIC_BY_CONTEXT[ctx];
}

/**
 * Log raw error details for diagnostics. Never throws.
 * Writes to console always; best-effort insert into `error_logs`.
 */
export function logRawError(err: unknown, ctx: ErrorContext, extra?: Record<string, unknown>): void {
  const raw = messageOf(err);
  // eslint-disable-next-line no-console
  console.error(`[settings-security:${ctx}]`, raw, extra ?? {}, err);
  try {
    void supabase.from("error_logs").insert({
      source: `client:${ctx}`,
      level: "error",
      message: raw.slice(0, 2000) || "unknown",
      url: typeof window !== "undefined" ? window.location.href : null,
      metadata: (extra ?? {}) as never,
    } as never);
  } catch {
    /* swallow — never throw from a logger */
  }
}

/** Test-only helper: ensure a rendered string never contains raw backend leaks. */
export function assertNoRawLeakage(text: string): void {
  if (isLeaky(text)) {
    throw new Error(`Leaky raw error text detected in UI copy: ${text}`);
  }
}

export const LEAKY_PATTERNS_FOR_TESTS = LEAKY_PATTERNS;
