import { supabase } from "@/integrations/supabase/client";
import { runtimeConfig } from "@/lib/runtimeConfig";

let installed = false;
const recent = new Map<string, number>();
const DEDUPE_MS = 30_000;

// Errors we never want to log or treat as fatal — these are normal app
// lifecycle events (e.g. logged-out users have no refresh token).
const BENIGN_PATTERNS = [
  /refresh_token_not_found/i,
  /Invalid Refresh Token/i,
  /AuthSessionMissingError/i,
  /Auth session missing/i,
];

function isBenign(message: string): boolean {
  return BENIGN_PATTERNS.some((re) => re.test(message));
}

function safePageUrl(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return `${window.location.origin}${window.location.pathname}`;
}

function safeMetadata(context: Record<string, unknown> | undefined, release: string | undefined) {
  const candidate = {
    ...(context ?? {}),
    release,
    user_agent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
  };
  try {
    return JSON.parse(JSON.stringify(candidate)) as Record<string, unknown>;
  } catch {
    return { release, serialization_error: true };
  }
}

async function reportIndependently(payload: Record<string, unknown>): Promise<void> {
  if (!runtimeConfig.errorReportingEndpoint) return;
  try {
    await fetch(runtimeConfig.errorReportingEndpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      credentials: "omit",
      keepalive: true,
    });
  } catch {
    // Reporting must never become another application failure.
  }
}

export async function reportClientError(
  message: string,
  stack?: string,
  context?: Record<string, unknown>,
): Promise<void> {
  if (isBenign(message)) return;
  const key = `${message}::${(stack || "").slice(0, 200)}`;
  const now = Date.now();
  const last = recent.get(key);
  if (last && now - last < DEDUPE_MS) return;
  recent.set(key, now);
  if (recent.size > 50) recent.clear();

  const release = import.meta.env.VITE_APP_RELEASE || undefined;
  const metadata = safeMetadata(context, release);
  const payload = {
    message: message.slice(0, 2000),
    stack: stack?.slice(0, 8000),
    url: safePageUrl(),
    source: "client",
    level: "error",
    release,
    metadata,
  };

  // This endpoint is intentionally independent of Supabase so bootstrap and
  // Supabase outage failures still reach operations.
  await reportIndependently(payload);

  if (!runtimeConfig.isValid) return;
  try {
    const { data } = await supabase.auth.getUser();
    await supabase.from("error_logs").insert({
      user_id: data?.user?.id ?? undefined,
      message: payload.message,
      stack: payload.stack,
      url: payload.url,
      source: payload.source,
      level: payload.level,
      metadata,
    });
  } catch {
    /* swallow — never let logging break the app */
  }
}

export function installErrorReporter() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  window.addEventListener("error", (e) => {
    void reportClientError(e.message || "window.error", e.error?.stack, {
      filename: e.filename,
      lineno: e.lineno,
      colno: e.colno,
    });
  });

  window.addEventListener("unhandledrejection", (e) => {
    const reason = e.reason;
    const message = reason instanceof Error ? reason.message : String(reason ?? "unhandledrejection");
    const stack = reason instanceof Error ? reason.stack : undefined;
    void reportClientError(message, stack, { type: "unhandledrejection" });
  });
}
