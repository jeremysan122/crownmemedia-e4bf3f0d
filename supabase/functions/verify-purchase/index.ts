// On-demand purchase verification fallback for the success page.
// If the webhook is delayed, this re-pulls the Stripe session and runs
// the same crediting logic the webhook would, idempotent on session_id.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  type StripeEnv,
  createStripeClient,
  isStripeEnvironmentEnabled,
} from "../_shared/stripe.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: ud, error: ae } = await userClient.auth.getUser();
    if (ae || !ud?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = ud.user.id;

    const { session_id, environment } = await req.json().catch(() => ({}));
    if (!session_id || typeof session_id !== "string" || !session_id.startsWith("cs_")) {
      return new Response(JSON.stringify({ error: "session_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (environment !== "sandbox" && environment !== "live") {
      return new Response(JSON.stringify({ error: "environment required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const env: StripeEnv = environment;
    if (!isStripeEnvironmentEnabled(env)) {
      return new Response(JSON.stringify({ error: "Sandbox verification is disabled" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const stripe = createStripeClient(env);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Pull session from Stripe and check ownership FIRST, before any DB lookup,
    // so we never leak another user's ledger entries to a caller who only knows
    // their session_id.
    const session = await stripe.checkout.sessions.retrieve(session_id, {
      expand: ["line_items", "line_items.data.price"],
    });
    if (session.metadata?.user_id !== userId) {
      return new Response(JSON.stringify({ error: "Not your session" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Already credited? Scoped to the authenticated user as defence-in-depth.
    const { data: existing, error: existingError } = await admin
      .from("shekel_ledger")
      .select("id, kind, shekels_delta, usd_amount, label, created_at")
      .eq("stripe_session_id", session_id)
      .eq("user_id", userId)
      .order("created_at", { ascending: true });
    if (existingError) throw new Error(`Purchase receipt lookup failed: ${existingError.message}`);
    if (existing && existing.length > 0) {
      return new Response(JSON.stringify({
        status: "already_credited",
        ledger: existing,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (session.payment_status !== "paid") {
      return new Response(JSON.stringify({
        status: "unpaid",
        payment_status: session.payment_status,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Mirror webhook bundle/boost crediting (Royal Pass is handled by its own subscription event;
    // we leave it to the webhook so we don't double-write subscription rows).
    if (session.mode === "subscription") {
      return new Response(JSON.stringify({
        status: "pending_subscription",
        message: "Subscription will be activated by webhook within a few seconds.",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let totalShekels = 0;
    let totalUsd = 0;
    const labels: string[] = [];
    const resolvedItems: Array<Record<string, unknown>> = [];
    const boostsToActivate: Array<{
      boost_type: string;
      duration_hours: number;
      post_id: string | null;
      label: string;
    }> = [];
    const lineItems = session.line_items?.data
      ?? (await stripe.checkout.sessions.listLineItems(session.id, { limit: 20 })).data;

    for (const item of lineItems) {
      const priceObj = item.price as { id?: string; lookup_key?: string | null; metadata?: Record<string, string> } | null;
      const stripePriceId = priceObj?.id;
      // DB stores the human-readable lookup_key (e.g. "shekels_starter_pouch"),
      // not Stripe's internal price_xxx id. Prefer lookup_key, fall back to
      // legacy metadata, then to the raw id as a last resort.
      const lookupKey = priceObj?.lookup_key
        || priceObj?.metadata?.lovable_external_id
        || stripePriceId;
      if (!lookupKey) continue;
      const qty = item.quantity || 1;
      if (!Number.isInteger(qty) || qty !== 1) {
        throw new Error(`Unexpected Store line-item quantity: ${qty}`);
      }
      const itemUsd = (item.amount_total ?? 0) / 100;
      totalUsd += itemUsd;

      const { data: bundle, error: bundleError } = await admin
        .from("shekel_bundles")
        .select("shekels, label")
        .eq("stripe_price_id", lookupKey)
        .maybeSingle();
      if (bundleError) throw new Error(`Shekel bundle lookup failed: ${bundleError.message}`);
      if (bundle) {
        const credit = Number(bundle.shekels) * qty;
        if (!Number.isFinite(credit) || credit <= 0) throw new Error("Invalid Shekel bundle amount");
        totalShekels += credit;
        labels.push(bundle.label);
        resolvedItems.push({ kind: "shekel_bundle", price_id: lookupKey, quantity: qty, shekels: credit });
        continue;
      }

      const { data: boost, error: boostError } = await admin
        .from("boost_bundles")
        .select("boost_type, duration_hours, label")
        .eq("stripe_price_id", lookupKey)
        .maybeSingle();
      if (boostError) throw new Error(`Boost bundle lookup failed: ${boostError.message}`);
      if (boost) {
        const POST_TARGETED = new Set(["royal_boost", "vote_boost", "crown_spotlight", "crown_shield"]);
        const metaPostId = (session.metadata?.target_post_id as string | undefined) || null;
        if (POST_TARGETED.has(boost.boost_type) && !metaPostId) {
          throw new Error(`Boost ${boost.boost_type} is missing target_post_id metadata`);
        }
        const durationHours = Number(boost.duration_hours);
        if (!Number.isInteger(durationHours) || durationHours < 1 || durationHours > 720) {
          throw new Error(`Invalid duration for Boost ${boost.boost_type}`);
        }
        labels.push(`${boost.label} (${durationHours}h)`);
        boostsToActivate.push({
          boost_type: boost.boost_type,
          duration_hours: durationHours,
          post_id: POST_TARGETED.has(boost.boost_type) ? metaPostId : null,
          label: boost.label,
        });
        resolvedItems.push({
          kind: "boost",
          price_id: lookupKey,
          quantity: qty,
          boost_type: boost.boost_type,
          duration_hours: durationHours,
        });
        continue;
      }

      throw new Error(`Unknown paid Store line item: ${lookupKey}`);
    }

    const { error: fulfillmentError } = await admin.rpc("fulfill_store_checkout", {
      _user_id: userId,
      _stripe_session_id: session.id,
      _stripe_event_id: `verify-${session.id}`,
      _shekels: totalShekels,
      _usd_amount: totalUsd,
      _label: labels.join(" + ") || "CrownMe Store purchase",
      _boosts: boostsToActivate,
      _metadata: { items: resolvedItems, source: "verify-purchase" },
    });
    if (fulfillmentError) throw new Error(`Store fulfillment failed: ${fulfillmentError.message}`);

    const { data: fresh, error: freshError } = await admin
      .from("shekel_ledger")
      .select("id, kind, shekels_delta, usd_amount, label, created_at")
      .eq("stripe_session_id", session_id)
      .eq("user_id", userId)
      .order("created_at", { ascending: true });
    if (freshError) throw new Error(`Purchase receipt reload failed: ${freshError.message}`);

    return new Response(JSON.stringify({
      status: "credited",
      ledger: fresh ?? [],
      total_shekels: totalShekels,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("[verify-purchase]", err);
    return new Response(JSON.stringify({
      error: "Could not verify purchase. Please try again.",
    }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
