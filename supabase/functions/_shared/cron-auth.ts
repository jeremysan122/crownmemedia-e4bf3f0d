const encoder = new TextEncoder();

function constantTimeEqual(left: string, right: string): boolean {
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  const length = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

export type CronAuthorization =
  | { ok: true }
  | { ok: false; status: 401 | 503; error: string };

/** Authenticate non-browser scheduler calls without exposing service-role JWTs. */
export function authorizeCronRequest(req: Request): CronAuthorization {
  const expected = Deno.env.get("CRON_SECRET")?.trim() ?? "";
  if (expected.length < 32) {
    console.error("CRON_SECRET is missing or too short");
    return { ok: false, status: 503, error: "scheduler authentication is not configured" };
  }

  const bearer = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  const supplied = req.headers.get("x-crownme-cron-secret")?.trim() || bearer || "";
  if (!supplied || !constantTimeEqual(supplied, expected)) {
    return { ok: false, status: 401, error: "unauthorized" };
  }
  return { ok: true };
}

export const cronResponseHeaders = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};
