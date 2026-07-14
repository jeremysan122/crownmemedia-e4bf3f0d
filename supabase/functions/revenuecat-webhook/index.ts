// RevenueCat webhook receiver.
//
// Maps RevenueCat events to the same ledger/entitlement surfaces used by the
// Stripe `payments-webhook`, so a Royal Pass purchased on iOS via the App
// Store ends up in the same `royal_pass_subscriptions` row a Stripe purchase
// would write. Idempotent via `revenuecat_events.event_id` unique constraint.
//
// Auth: RevenueCat signs its webhook with a static Authorization header value
// you configure in the RevenueCat dashboard. We compare against the
// `REVENUECAT_WEBHOOK_AUTH` secret using a constant-time check.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

let _sb: ReturnType<typeof createClient> | null = null;
function sb() {
  if (!_sb) {
    _sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
  }
  return _sb;
}

type RcEvent = {
  type: string;
  id: string;
  app_user_id: string;
  product_id?: string;
  entitlement_ids?: string[];
  period_type?: string;
  purchased_at_ms?: number;
  expiration_at_ms?: number;
  environment?: "SANDBOX" | "PRODUCTION";
  store?: "APP_STORE" | "PLAY_STORE" | "AMAZON" | "STRIPE" | "PROMOTIONAL";
  price_in_purchased_currency?: number;
  currency?: string;
  transaction_id?: string;
  original_transaction_id?: string;
};

// Map RevenueCat product_id → CrownMe entitlement slug.
// Kept here (not the DB) so the mapping is reviewable in code review.
const ENTITLEMENT_MAP: Record<string, "royal_pass" | "verification" | "shekels" | "boost"> = {
  royal_pass_monthly: "royal_pass",
  royal_pass_yearly: "royal_pass",
  verification_fast_track: "verification",
  // Shekel SKUs are consumable — handled separately below.
};

async function ensureIdempotent(eventId: string): Promise<boolean> {
  const { error } = await sb().from("revenuecat_events").insert({ event_id: eventId });
  // unique_violation = already processed, return false (skip).
  if (error && (error as { code?: string }).code === "23505") return false;
  if (error) throw error;
  return true;
}

async function activateRoyalPass(e: RcEvent) {
  const expiresAt = e.expiration_at_ms ? new Date(e.expiration_at_ms).toISOString() : null;
  await sb().from("royal_pass_subscriptions").upsert(
    {
      user_id: e.app_user_id,
      status: "active",
      provider: "revenuecat",
      provider_subscription_id: e.original_transaction_id ?? e.transaction_id ?? e.id,
      current_period_end: expiresAt,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "provider_subscription_id" },
  );
}

async function deactivateRoyalPass(e: RcEvent) {
  await sb()
    .from("royal_pass_subscriptions")
    .update({ status: "canceled", cancel_at_period_end: false, updated_at: new Date().toISOString() })
    .eq("provider_subscription_id", e.original_transaction_id ?? e.transaction_id ?? e.id);
}

// Stripe parity: user-initiated cancel with a future expiration keeps
// access until period end. Mirrors setting `cancel_at_period_end = true`
// without revoking `status = 'active'`.
async function scheduleRoyalPassCancel(e: RcEvent) {
  const expiresAt = e.expiration_at_ms ? new Date(e.expiration_at_ms).toISOString() : null;
  await sb()
    .from("royal_pass_subscriptions")
    .update({
      cancel_at_period_end: true,
      current_period_end: expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("provider_subscription_id", e.original_transaction_id ?? e.transaction_id ?? e.id);
}

async function activateVerification(e: RcEvent) {
  await sb()
    .from("verification_requests")
    .update({ paid_fast_track: true, paid_provider: "revenuecat", updated_at: new Date().toISOString() })
    .eq("user_id", e.app_user_id)
    .is("decided_at", null);
}

async function creditShekels(e: RcEvent) {
  // Look up bundle by RevenueCat product_id mirror column.
  const { data: bundle } = await sb()
    .from("shekel_bundles")
    .select("id, shekels")
    .eq("revenuecat_product_id", e.product_id ?? "")
    .maybeSingle();
  if (!bundle) {
    console.warn("[revenuecat] no shekel bundle for product", e.product_id);
    return;
  }
  await sb().from("shekel_ledger").insert({
    user_id: e.app_user_id,
    delta: (bundle as { shekels: number }).shekels,
    reason: "purchase_revenuecat",
    provider: "revenuecat",
    provider_reference: e.transaction_id ?? e.id,
  });
}

async function logTransaction(e: RcEvent, status: string) {
  await sb().from("payment_transactions").insert({
    user_id: e.app_user_id,
    provider: "revenuecat",
    provider_event_id: e.id,
    provider_transaction_id: e.transaction_id ?? null,
    product_id: e.product_id ?? null,
    amount_cents: e.price_in_purchased_currency ? Math.round(e.price_in_purchased_currency * 100) : null,
    currency: e.currency ?? null,
    status,
    environment: (e.environment ?? "PRODUCTION").toLowerCase() === "sandbox" ? "sandbox" : "live",
    raw: e as unknown as Record<string, unknown>,
  });
}

async function dispatch(e: RcEvent) {
  const entitlement = e.product_id ? ENTITLEMENT_MAP[e.product_id] : undefined;
  const isShekel = e.product_id?.startsWith("shekels_") ?? false;

  switch (e.type) {
    case "INITIAL_PURCHASE":
    case "RENEWAL":
    case "UNCANCELLATION":
    case "PRODUCT_CHANGE":
      if (entitlement === "royal_pass") await activateRoyalPass(e);
      else if (entitlement === "verification") await activateVerification(e);
      else if (isShekel) await creditShekels(e);
      await logTransaction(e, "succeeded");
      break;
    case "NON_RENEWING_PURCHASE":
      if (isShekel) await creditShekels(e);
      await logTransaction(e, "succeeded");
      break;
    case "CANCELLATION": {
      // If expiration is still in the future, mirror Stripe's
      // cancel_at_period_end behavior; only revoke on EXPIRATION.
      const futureExpiry = e.expiration_at_ms && e.expiration_at_ms > Date.now();
      if (entitlement === "royal_pass") {
        if (futureExpiry) await scheduleRoyalPassCancel(e);
        else await deactivateRoyalPass(e);
      }
      await logTransaction(e, futureExpiry ? "scheduled_cancel" : "canceled");
      break;
    }
    case "EXPIRATION":
      if (entitlement === "royal_pass") await deactivateRoyalPass(e);
      await logTransaction(e, "canceled");
      break;
    case "BILLING_ISSUE":
      await logTransaction(e, "past_due");
      break;
    case "REFUND":
    case "SUBSCRIPTION_PAUSED":
      if (entitlement === "royal_pass") await deactivateRoyalPass(e);
      await logTransaction(e, "refunded");
      break;
    default:
      console.log("[revenuecat] unhandled type", e.type);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const expectedAuth = Deno.env.get("REVENUECAT_WEBHOOK_AUTH");
  const provided = req.headers.get("authorization") ?? "";
  if (!expectedAuth || !timingSafeEqual(provided, expectedAuth)) {
    return new Response("unauthorized", { status: 401 });
  }

  let body: { event?: RcEvent };
  try {
    body = await req.json();
  } catch {
    return new Response("bad json", { status: 400 });
  }
  const event = body?.event;
  if (!event?.id || !event.type || !event.app_user_id) {
    return new Response("bad event", { status: 400 });
  }

  try {
    const fresh = await ensureIdempotent(event.id);
    if (!fresh) {
      return new Response(JSON.stringify({ duplicate: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    await dispatch(event);
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[revenuecat] handler error", e);
    return new Response("handler error", { status: 500 });
  }
});
