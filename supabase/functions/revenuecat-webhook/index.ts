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
  const length = Math.max(a.length, b.length);
  let out = a.length ^ b.length;
  for (let i = 0; i < length; i++) out |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
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
    { onConflict: "user_id" },
  ).throwOnError();
}

async function deactivateRoyalPass(e: RcEvent) {
  await sb()
    .from("royal_pass_subscriptions")
    .update({ status: "canceled", cancel_at_period_end: false, updated_at: new Date().toISOString() })
    .eq("provider_subscription_id", e.original_transaction_id ?? e.transaction_id ?? e.id)
    .throwOnError();
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
    .eq("provider_subscription_id", e.original_transaction_id ?? e.transaction_id ?? e.id)
    .throwOnError();
}

async function activateVerification(e: RcEvent) {
  const { data: existing, error: readError } = await sb()
    .from("verification_requests")
    .select("id")
    .eq("user_id", e.app_user_id)
    .in("status", ["pending", "more_info_required"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (readError) throw readError;

  const subscriptionId = e.original_transaction_id ?? e.transaction_id ?? e.id;
  const renewsAt = e.expiration_at_ms ? new Date(e.expiration_at_ms).toISOString() : null;
  if (existing) {
    await sb()
      .from("verification_requests")
      .update({
        subscription_active: true,
        subscription_id: subscriptionId,
        subscription_renews_at: renewsAt,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .throwOnError();
    return;
  }

  await sb().from("verification_requests").insert({
    user_id: e.app_user_id,
    plan: "subscription",
    status: "pending",
    legal_name: "(via subscription — pending user submission)",
    category: "subscription",
    reason: "Paid priority-review slot. Awaiting user documents and admin review.",
    subscription_active: true,
    subscription_id: subscriptionId,
    subscription_renews_at: renewsAt,
  }).throwOnError();
}

async function deactivateVerification(e: RcEvent) {
  await sb()
    .from("verification_requests")
    .update({ subscription_active: false, updated_at: new Date().toISOString() })
    .eq("user_id", e.app_user_id)
    .eq("subscription_id", e.original_transaction_id ?? e.transaction_id ?? e.id)
    .throwOnError();
}

async function creditShekels(e: RcEvent) {
  // Look up bundle by RevenueCat product_id mirror column.
  const { data: bundle, error: bundleError } = await sb()
    .from("shekel_bundles")
    .select("id, shekels")
    .eq("revenuecat_product_id", e.product_id ?? "")
    .maybeSingle();
  if (bundleError) throw bundleError;
  if (!bundle) {
    throw new Error(`No Shekel bundle mapping for paid product ${e.product_id ?? "unknown"}`);
  }
  const purchaseEventId = e.transaction_id ?? e.original_transaction_id ?? e.id;
  const { error } = await sb().rpc("credit_provider_shekels", {
    _user_id: e.app_user_id,
    _provider: "revenuecat",
    _provider_event_id: purchaseEventId,
    _amount: (bundle as { shekels: number }).shekels,
    _label: `RevenueCat ${e.product_id ?? "Shekel"} purchase`,
    _metadata: {
      transaction_id: e.transaction_id ?? null,
      original_transaction_id: e.original_transaction_id ?? null,
      product_id: e.product_id ?? null,
      revenuecat_event_id: e.id,
      environment: e.environment,
      store: e.store,
    },
  });
  if (error) throw error;
}

async function reverseShekels(e: RcEvent) {
  const purchaseEventId = e.transaction_id ?? e.original_transaction_id;
  if (!purchaseEventId) throw new Error("Refund is missing its purchase transaction id");
  const { error } = await sb().rpc("reverse_provider_shekel_purchase", {
    _user_id: e.app_user_id,
    _provider: "revenuecat",
    _purchase_event_id: purchaseEventId,
    _reversal_event_id: e.id,
    _reason: `RevenueCat refund ${e.product_id ?? "Shekel purchase"}`,
  });
  if (error) throw error;
}

async function logTransaction(e: RcEvent, status: string) {
  const entitlement = e.product_id ? ENTITLEMENT_MAP[e.product_id] : undefined;
  const intent = e.product_id?.startsWith("shekels_")
    ? "shekel_purchase"
    : entitlement === "royal_pass"
      ? "royal_pass"
      : entitlement === "verification"
        ? "verification"
        : "adjustment";
  await sb().from("payment_transactions").upsert({
    user_id: e.app_user_id,
    provider: "revenuecat",
    provider_event_id: e.id,
    external_reference_id: e.transaction_id ?? e.original_transaction_id ?? null,
    reference_table: "revenuecat_events",
    intent,
    amount_usd: e.price_in_purchased_currency ?? null,
    currency: e.currency ?? "USD",
    description: `RevenueCat ${e.type}`,
    status,
    metadata: {
      environment: e.environment,
      store: e.store,
      product_id: e.product_id ?? null,
      transaction_id: e.transaction_id ?? null,
      original_transaction_id: e.original_transaction_id ?? null,
      period_type: e.period_type ?? null,
    },
  }, {
    onConflict: "provider,provider_event_id",
    ignoreDuplicates: true,
  }).throwOnError();
}

async function dispatch(e: RcEvent) {
  const entitlement = e.product_id ? ENTITLEMENT_MAP[e.product_id] : undefined;
  const isShekel = e.product_id?.startsWith("shekels_") ?? false;
  const paidDeliveryEvent = new Set([
    "INITIAL_PURCHASE", "RENEWAL", "UNCANCELLATION", "PRODUCT_CHANGE", "NON_RENEWING_PURCHASE",
  ]).has(e.type);
  if (paidDeliveryEvent && !entitlement && !isShekel) {
    throw new Error(`Unrecognized paid RevenueCat product ${e.product_id ?? "missing"}`);
  }

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
      else if (entitlement === "verification") await activateVerification(e);
      else if (entitlement === "royal_pass") await activateRoyalPass(e);
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
      else if (entitlement === "verification") await deactivateVerification(e);
      await logTransaction(e, "canceled");
      break;
    case "BILLING_ISSUE":
      await logTransaction(e, "past_due");
      break;
    case "REFUND":
    case "SUBSCRIPTION_PAUSED":
      if (entitlement === "royal_pass") await deactivateRoyalPass(e);
      else if (entitlement === "verification") await deactivateVerification(e);
      else if (e.type === "REFUND" && isShekel) await reverseShekels(e);
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
  if (!expectedAuth || expectedAuth.length < 32) {
    console.error("REVENUECAT_WEBHOOK_AUTH is missing or too short");
    return new Response("webhook authentication unavailable", { status: 503 });
  }
  if (!timingSafeEqual(provided, expectedAuth)) {
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
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(event.app_user_id)) {
    return new Response("invalid app_user_id", { status: 400 });
  }
  if (event.environment !== "SANDBOX" && event.environment !== "PRODUCTION") {
    return new Response("invalid environment", { status: 400 });
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
    // Release the idempotency claim so RevenueCat can safely retry.
    await sb().from("revenuecat_events").delete().eq("event_id", event.id);
    return new Response("handler error", { status: 500 });
  }
});
