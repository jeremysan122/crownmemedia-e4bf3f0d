// Hourly reconciliation cron for Royal Pass subscriptions.
//
// Finds royal_pass_subscriptions rows that may have drifted from Stripe
// (active/trialing rows whose current_period_end is in the past, dunning
// statuses stuck for >6h, or rows not touched in >24h) and re-hydrates
// them directly from Stripe. Mirrors the manual "Refresh Entitlements"
// admin action in `royal-pass-sync` but runs unattended and in batch.
//
// Auth: called by pg_cron with the service-role bearer. The gateway verifies
// the JWT and this handler performs a constant-time service-role check before
// any Stripe request or privileged database read.
// All Stripe work uses the shared gateway client; all writes use the
// service-role client. Every subscription touched (or attempted) is
// recorded in `royal_pass_sync_audit` for traceability.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { type StripeEnv, createStripeClient, isStripeEnvironmentEnabled } from "../_shared/stripe.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const STALE_STATUSES = new Set(["active", "trialing", "past_due", "unpaid", "incomplete"]);
const MAX_BATCH = 50;

async function constantTimeEquals(a: string, b: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [ad, bd] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(a)),
    crypto.subtle.digest("SHA-256", encoder.encode(b)),
  ]);
  const l = new Uint8Array(ad);
  const r = new Uint8Array(bd);
  let mismatch = l.length ^ r.length;
  for (let i = 0; i < Math.min(l.length, r.length); i += 1) mismatch |= l[i] ^ r[i];
  return mismatch === 0;
}

async function isAuthorizedCronRequest(req: Request): Promise<boolean> {
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const supplied = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (serviceKey && supplied && await constantTimeEquals(serviceKey, supplied)) return true;

  const cronSecret = Deno.env.get("CRON_SHARED_SECRET") ?? "";
  const header = req.headers.get("x-cron-secret") ?? "";
  if (cronSecret && header && await constantTimeEquals(cronSecret, header)) return true;

  return false;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  if (!(await isAuthorizedCronRequest(req))) {
    return json(401, { error: "unauthorized" });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const started = Date.now();
  const summary = { scanned: 0, updated: 0, unchanged: 0, errors: 0, skipped: 0 };

  try {
    // Pull rows most in need of a refresh first: those with a stale
    // current_period_end, then dunning rows, then anything not touched
    // in the last 24h.
    const nowIso = new Date().toISOString();
    const cutoffIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: rows, error } = await admin
      .from("royal_pass_subscriptions")
      .select("user_id, status, stripe_subscription_id, current_period_end, updated_at")
      .or(
        [
          `and(status.in.(active,trialing),current_period_end.lt.${nowIso})`,
          `status.in.(past_due,unpaid,incomplete)`,
          `updated_at.lt.${cutoffIso}`,
        ].join(","),
      )
      .limit(MAX_BATCH);

    if (error) {
      console.error("[royal-pass-reconcile] query error", error);
      return json(500, { error: error.message });
    }

    for (const row of rows ?? []) {
      summary.scanned++;

      // Only Stripe-backed rows are reconcilable here. RevenueCat/App
      // Store rows are pushed to us and don't have a Stripe id.
      const stripeSubId = (row as any).stripe_subscription_id ?? null;
      if (!stripeSubId) {
        summary.skipped++;
        continue;
      }

      // Production reconciles live subscriptions only. Controlled test
      // projects may explicitly enable sandbox through the server secret.
      const envsToTry: StripeEnv[] = (["live", "sandbox"] as StripeEnv[])
        .filter(isStripeEnvironmentEnabled);
      let handled = false;

      for (const env of envsToTry) {
        try {
          const stripe = createStripeClient(env);
          const stripeSub = await stripe.subscriptions.retrieve(stripeSubId);
          const item = (stripeSub as any).items?.data?.[0];
          const periodEnd = item?.current_period_end ?? (stripeSub as any).current_period_end ?? null;
          const periodStart = item?.current_period_start ?? (stripeSub as any).current_period_start ?? null;
          const customerId = typeof stripeSub.customer === "string"
            ? stripeSub.customer
            : (stripeSub.customer as any)?.id ?? null;

          const patch = {
            status: stripeSub.status,
            stripe_customer_id: customerId,
            stripe_subscription_id: stripeSub.id,
            cancel_at_period_end: !!stripeSub.cancel_at_period_end,
            current_period_start: periodStart ? new Date(periodStart * 1000).toISOString() : null,
            current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
            updated_at: new Date().toISOString(),
          };

          const { error: upErr } = await admin
            .from("royal_pass_subscriptions")
            .update(patch)
            .eq("user_id", (row as any).user_id);

          if (upErr) throw upErr;

          const statusChanged = (row as any).status !== stripeSub.status;
          if (statusChanged) summary.updated++;
          else summary.unchanged++;

          await admin.from("royal_pass_sync_audit").insert({
            actor_user_id: null, // system-invoked
            target_user_id: (row as any).user_id,
            environment: env,
            success: true,
            status: stripeSub.status,
            stripe_subscription_id: stripeSub.id,
            current_period_end: patch.current_period_end,
            error: null,
          });

          handled = true;
          break;
        } catch (e) {
          // Retrieve failed in this env (likely wrong env or missing key).
          // Try the next env silently; only log if both fail.
          const msg = (e as Error).message || String(e);
          if (env === envsToTry[envsToTry.length - 1]) {
            summary.errors++;
            await admin.from("royal_pass_sync_audit").insert({
              actor_user_id: null,
              target_user_id: (row as any).user_id,
              environment: env,
              success: false,
              status: null,
              stripe_subscription_id: stripeSubId,
              current_period_end: null,
              error: msg.slice(0, 500),
            });
            console.warn("[royal-pass-reconcile] retrieve failed", (row as any).user_id, msg);
          }
        }
      }

      if (!handled) continue;
    }

    return json(200, {
      ok: true,
      duration_ms: Date.now() - started,
      ...summary,
    });
  } catch (err) {
    console.error("[royal-pass-reconcile] fatal", err);
    return json(500, { error: (err as Error).message || "reconcile failed" });
  }
});
