import { supabase } from "@/integrations/supabase/client";

let installed = false;
const recent = new Map<string, number>();
const DEDUPE_MS = 30_000;

async function report(message: string, stack?: string, context?: Record<string, unknown>) {
  try {
    const key = `${message}::${(stack || "").slice(0, 200)}`;
    const now = Date.now();
    const last = recent.get(key);
    if (last && now - last < DEDUPE_MS) return;
    recent.set(key, now);
    if (recent.size > 50) recent.clear();

    const { data } = await supabase.auth.getUser();
    await supabase.from("error_logs").insert({
      user_id: data?.user?.id ?? undefined,
      message: message.slice(0, 2000),
      stack: stack?.slice(0, 8000),
      url: typeof window !== "undefined" ? window.location.href : undefined,
      source: "client",
      level: "error",
      metadata: JSON.parse(JSON.stringify({
        ...(context ?? {}),
        user_agent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
      })),
    });
  } catch {
    /* swallow — never let logging break the app */
  }
}

export function installErrorReporter() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  window.addEventListener("error", (e) => {
    report(e.message || "window.error", e.error?.stack, {
      filename: e.filename,
      lineno: e.lineno,
      colno: e.colno,
    });
  });

  window.addEventListener("unhandledrejection", (e) => {
    const reason = e.reason;
    const message = reason instanceof Error ? reason.message : String(reason ?? "unhandledrejection");
    const stack = reason instanceof Error ? reason.stack : undefined;
    report(message, stack, { type: "unhandledrejection" });
  });
}
