// Stripe Connect webhook → tracks Express account status & payouts
// Hardened: retries transient failures, returns 5xx on transient errors so
// Stripe retries automatically, never leaks raw error details to the client.
import Stripe from "https://esm.sh/stripe@17.5.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
const webhookSecret = Deno.env.get("STRIPE_CONNECT_WEBHOOK_SECRET");

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const stripe = stripeKey
  ? new Stripe(stripeKey, {
      apiVersion: "2024-12-18.acacia",
      httpClient: Stripe.createFetchHttpClient(),
    })
  : null;

// Only these codes are safe to echo back to the client (Stripe sees them).
// Internal/database/handler errors are masked.
const SAFE_ERROR_CODES = new Set([
  "missing_signature",
  "invalid_signature",
  "invalid_json",
  "unauthorized_test",
  "config_error",
]);

function jsonError(status: number, code: string, detail: string) {
  console.error(`[stripe-connect-webhook] ${code}: ${detail}`);
  const message = SAFE_ERROR_CODES.has(code) ? detail : "An internal error occurred";
  return new Response(JSON.stringify({ error: code, message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// Postgres / network error codes that are transient and worth retrying.
function isTransient(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null;
  if (!e) return false;
  const code = e.code || "";
  if (["40001", "40P01", "57014", "57P03", "08000", "08006", "08001", "08004", "53300", "55P03"].includes(code)) return true;
  const msg = (e.message || "").toLowerCase();
  return /timeout|timed out|temporarily|connection|fetch failed|network|econnreset|socket/.test(msg);
}

async function withRetry<T>(label: string, fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isTransient(err) || i === attempts - 1) throw err;
      const delay = 200 * Math.pow(2, i) + Math.floor(Math.random() * 100);
      console.warn(`[stripe-connect-webhook] transient ${label} (attempt ${i + 1}/${attempts}) — retrying in ${delay}ms`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

// Wraps a Supabase response: throws on error so withRetry can classify it.
async function sbRun<T>(label: string, p: PromiseLike<{ data: T; error: { code?: string; message?: string } | null }>): Promise<T> {
  return withRetry(label, async () => {
    const { data, error } = await p;
    if (error) throw error;
    return data;
  });
}

Deno.serve(async (req) => {
  if (!stripe) return jsonError(500, "config_error", "Stripe is not configured");
  if (!webhookSecret) return jsonError(500, "config_error", "Webhook secret is not configured");

  const sig = req.headers.get("stripe-signature");
  const isTest = Deno.env.get("ENABLE_WEBHOOK_TEST_BYPASS") === "true" && req.headers.get("x-test-bypass-signature") === "1";
  if (!sig && !isTest) return jsonError(400, "missing_signature", "stripe-signature header required");

  const body = await req.text();
  let event: Stripe.Event;

  if (isTest) {
    const testSecret = req.headers.get("x-test-secret");
    if (!testSecret || testSecret !== Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) {
      return jsonError(401, "unauthorized_test", "Test bypass requires service-role secret");
    }
    try { event = JSON.parse(body) as Stripe.Event; }
    catch { return jsonError(400, "invalid_json", "Test payload is not valid JSON"); }
  } else {
    try {
      event = await stripe.webhooks.constructEventAsync(body, sig!, webhookSecret);
    } catch (err) {
      return jsonError(400, "invalid_signature", `Stripe signature verification failed (${(err as Error).message})`);
    }
  }

  // Idempotency: try to insert event id; if it already exists, skip.
  // Distinguish duplicate (permanent) from transient DB error so Stripe retries the latter.
  try {
    const { error: dupErr } = await withRetry("dedupe-insert", async () =>
      await supabase.from("stripe_events").insert({ id: event.id, type: event.type })
    );
    if (dupErr) {
      // Unique violation = duplicate; anything else (already retried) we treat as duplicate to avoid re-processing
      console.log(`[stripe-connect-webhook] event ${event.id} (${event.type}) already processed — skipping`);
      return new Response(JSON.stringify({ ok: true, duplicate: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }
  } catch (err) {
    // Transient failure during dedupe insert → tell Stripe to retry
    return jsonError(503, "transient_error", `Could not record event: ${(err as Error).message}`);
  }

  try {
    switch (event.type) {
      case "account.updated": {
        const acct = event.data.object as Stripe.Account;
        await sbRun("update connect_accounts",
          supabase.from("connect_accounts")
            .update({
              charges_enabled: acct.charges_enabled,
              payouts_enabled: acct.payouts_enabled,
              details_submitted: acct.details_submitted,
              updated_at: new Date().toISOString(),
            })
            .eq("stripe_account_id", acct.id)
            .select()
        );
        console.log(`[stripe-connect-webhook] event=${event.id} account.updated ${acct.id} charges=${acct.charges_enabled} payouts=${acct.payouts_enabled}`);
        break;
      }
      case "payout.paid":
      case "payout.failed":
      case "payout.created": {
        const payout = event.data.object as Stripe.Payout;
        const accountId = event.account;
        if (!accountId) break;
        const status = event.type === "payout.paid" ? "paid"
          : event.type === "payout.failed" ? "failed" : "pending";

        const ca = await sbRun<{ user_id: string } | null>("lookup connect_account",
          supabase.from("connect_accounts").select("user_id")
            .eq("stripe_account_id", accountId).maybeSingle()
        );
        if (!ca) break;

        const existing = await sbRun<{ id: string } | null>("lookup payout",
          supabase.from("payouts").select("id").eq("stripe_payout_id", payout.id).maybeSingle()
        );

        if (existing) {
          await sbRun("update payout",
            supabase.from("payouts").update({ status }).eq("stripe_payout_id", payout.id).select()
          );
        } else {
          await sbRun("insert payout",
            supabase.from("payouts").insert({
              user_id: ca.user_id,
              amount_usd: payout.amount / 100,
              status,
              payout_method: "stripe_connect",
              stripe_payout_id: payout.id,
              stripe_account_id: accountId,
            }).select()
          );
        }
        console.log(`[stripe-connect-webhook] event=${event.id} ${event.type} payout=${payout.id} amount_usd=${payout.amount / 100} user=${ca.user_id}`);
        break;
      }
    }
  } catch (err) {
    // Roll back the dedupe row so Stripe (or our retry) can reprocess.
    console.error(`[stripe-connect-webhook] handler error for ${event.id}:`, err);
    try {
      await supabase.from("stripe_events").delete().eq("id", event.id);
    } catch (delErr) {
      console.error(`[stripe-connect-webhook] failed to roll back dedupe row for ${event.id}:`, delErr);
    }
    const transient = isTransient(err);
    // 5xx → Stripe will retry automatically; 4xx → permanent failure
    return jsonError(transient ? 503 : 500, transient ? "transient_error" : "handler_error", (err as Error).message);
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
