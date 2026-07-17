// On-demand purchase verification fallback for the success page.
// If the webhook is delayed, this re-pulls the Stripe session and runs
// the same crediting logic the webhook would, idempotent on session_id.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { type StripeEnv, createStripeClient } from "../_shared/stripe.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

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
    const env: StripeEnv = environment === "live" ? "live" : "sandbox";
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
    if ((session.metadata?.user_id || session.metadata?.userId) !== userId) {
      return new Response(JSON.stringify({ error: "Not your session" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
    let bundleUsd = 0;
    const purchasedBundles: Array<{ label: string; quantity: number; shekels: number }> = [];
    const unknownLineItems: string[] = [];
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
      if (!lookupKey) {
        unknownLineItems.push("missing_lookup_and_price");
        continue;
      }
      const qty = item.quantity || 1;
      const itemUsd = (item.amount_total ?? 0) / 100;

      const { data: bundle } = await admin
        .from("shekel_bundles")
        .select("shekels, label")
        .eq("stripe_price_id", lookupKey)
        .maybeSingle()
        .throwOnError();
      if (bundle) {
        const credit = Number(bundle.shekels) * qty;
        totalShekels += credit;
        bundleUsd += itemUsd;
        purchasedBundles.push({ label: bundle.label, quantity: qty, shekels: credit });
        continue;
      }

      const { data: boost } = await admin
        .from("boost_bundles")
        .select("boost_type, duration_hours, label")
          .eq("stripe_price_id", lookupKey)
          .maybeSingle()
          .throwOnError();
      if (boost) {
        const expires = new Date(Date.now() + boost.duration_hours * 3600_000).toISOString();
        const POST_TARGETED = new Set(["royal_boost", "vote_boost", "crown_spotlight", "crown_shield"]);
        const metaPostId = (session.metadata?.target_post_id as string | undefined) || null;
        let postIdToWrite: string | null = null;
        if (POST_TARGETED.has(boost.boost_type) && metaPostId) {
          const { data: ownerPost } = await admin
            .from("posts").select("id, user_id, is_removed")
            .eq("id", metaPostId).maybeSingle().throwOnError();
          if (ownerPost && !ownerPost.is_removed && ownerPost.user_id === userId) {
            postIdToWrite = ownerPost.id;
          }
        }
        const providerLineKey = `${lookupKey}:${qty}`;
        const { data: b } = await admin.from("boosts")
          .upsert({
            user_id: userId,
            post_id: postIdToWrite,
            boost_type: boost.boost_type,
            active: true,
            expires_at: expires,
            provider_event_id: session.id,
            provider_line_key: providerLineKey,
          }, { onConflict: "provider_event_id,provider_line_key", ignoreDuplicates: true })
          .select("id").maybeSingle().throwOnError();
        await admin.from("shekel_ledger").upsert({
          user_id: userId,
          kind: "boost_stripe",
          shekels_delta: 0,
          usd_amount: itemUsd,
          label: `${boost.label} (${boost.duration_hours}h)`,
          stripe_session_id: session.id,
          provider_event_id: `${session.id}:boost:${providerLineKey}`,
          reference_id: b?.id ?? null,
          metadata: { price_id: lookupKey, boost_type: boost.boost_type, source: "verify-purchase" },
        }, { onConflict: "kind,provider_event_id", ignoreDuplicates: true }).throwOnError();
        continue;
      }

      unknownLineItems.push(lookupKey);
    }

    if (unknownLineItems.length > 0) {
      throw new Error(`Unrecognized paid checkout line item(s): ${unknownLineItems.join(", ")}`);
    }

    if (totalShekels > 0) {
      const { error } = await admin.rpc("credit_provider_shekels", {
        _user_id: userId,
        _provider: "stripe",
        _provider_event_id: session.id,
        _amount: totalShekels,
        _label: purchasedBundles.map((bundle) => bundle.label).join(" + ") || "Stripe Shekel purchase",
        _metadata: { bundles: purchasedBundles, source: "verify-purchase" },
        _usd_amount: bundleUsd,
        _stripe_event_id: null,
      });
      if (error) throw error;
    }

    const { data: fresh } = await admin
      .from("shekel_ledger")
      .select("id, kind, shekels_delta, usd_amount, label, created_at")
      .eq("stripe_session_id", session_id)
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .throwOnError();

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
