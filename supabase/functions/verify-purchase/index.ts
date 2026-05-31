// On-demand purchase verification fallback for the success page.
// If the webhook is delayed, this re-pulls the Stripe session and runs
// the same crediting logic the webhook would, idempotent on session_id.
import Stripe from "https://esm.sh/stripe@17.5.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2024-12-18.acacia",
  httpClient: Stripe.createFetchHttpClient(),
});

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

    const { session_id } = await req.json().catch(() => ({}));
    if (!session_id || typeof session_id !== "string" || !session_id.startsWith("cs_")) {
      return new Response(JSON.stringify({ error: "session_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Pull session from Stripe and check ownership FIRST, before any DB lookup,
    // so we never leak another user's ledger entries to a caller who only knows
    // their session_id.
    const session = await stripe.checkout.sessions.retrieve(session_id, {
      expand: ["line_items"],
    });
    if (session.metadata?.user_id !== userId) {
      return new Response(JSON.stringify({ error: "Not your session" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Already credited? Scoped to the authenticated user as defence-in-depth.
    const { data: existing } = await admin
      .from("shekel_ledger")
      .select("id, kind, shekels_delta, usd_amount, label, created_at")
      .eq("stripe_session_id", session_id)
      .eq("user_id", userId)
      .order("created_at", { ascending: true });
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
    const lineItems = session.line_items?.data
      ?? (await stripe.checkout.sessions.listLineItems(session.id, { limit: 20 })).data;

    for (const item of lineItems) {
      const priceId = item.price?.id;
      if (!priceId) continue;
      const qty = item.quantity || 1;
      const itemUsd = (item.amount_total ?? 0) / 100;

      const { data: bundle } = await admin
        .from("shekel_bundles")
        .select("shekels, label")
        .eq("stripe_price_id", priceId)
        .maybeSingle();
      if (bundle) {
        const credit = Number(bundle.shekels) * qty;
        totalShekels += credit;
        await admin.from("shekel_ledger").insert({
          user_id: userId,
          kind: "bundle_purchase",
          shekels_delta: credit,
          usd_amount: itemUsd,
          label: bundle.label,
          stripe_session_id: session.id,
          metadata: { price_id: priceId, quantity: qty, source: "verify-purchase" },
        });
        continue;
      }

      const { data: boost } = await admin
        .from("boost_bundles")
        .select("boost_type, duration_hours, label")
        .eq("stripe_price_id", priceId)
        .maybeSingle();
      if (boost) {
        const expires = new Date(Date.now() + boost.duration_hours * 3600_000).toISOString();
        const POST_TARGETED = new Set(["royal_boost", "vote_boost", "crown_spotlight", "crown_shield"]);
        const metaPostId = (session.metadata?.target_post_id as string | undefined) || null;
        let postIdToWrite: string | null = null;
        if (POST_TARGETED.has(boost.boost_type) && metaPostId) {
          const { data: ownerPost } = await admin
            .from("posts").select("id, user_id, is_removed")
            .eq("id", metaPostId).maybeSingle();
          if (ownerPost && !ownerPost.is_removed && ownerPost.user_id === userId) {
            postIdToWrite = ownerPost.id;
          }
        }
        const { data: b } = await admin.from("boosts")
          .insert({ user_id: userId, post_id: postIdToWrite, boost_type: boost.boost_type, active: true, expires_at: expires })
          .select("id").single();
        await admin.from("shekel_ledger").insert({
          user_id: userId,
          kind: "boost_stripe",
          shekels_delta: 0,
          usd_amount: itemUsd,
          label: `${boost.label} (${boost.duration_hours}h)`,
          stripe_session_id: session.id,
          reference_id: b?.id ?? null,
          metadata: { price_id: priceId, boost_type: boost.boost_type, source: "verify-purchase" },
        });
      }
    }

    if (totalShekels > 0) {
      const { data: w } = await admin.from("wallets")
        .select("shekel_balance").eq("user_id", userId).maybeSingle();
      if (w) {
        await admin.from("wallets")
          .update({
            shekel_balance: Number(w.shekel_balance) + totalShekels,
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", userId);
      }
    }

    const { data: fresh } = await admin
      .from("shekel_ledger")
      .select("id, kind, shekels_delta, usd_amount, label, created_at")
      .eq("stripe_session_id", session_id)
      .eq("user_id", userId)
      .order("created_at", { ascending: true });

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
