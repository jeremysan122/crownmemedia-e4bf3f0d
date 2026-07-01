// Creates a Lovable-managed Stripe embedded-checkout session for Shekel bundles
// or Boost bundles. Client sends bundle_id OR boost_bundle_id (never stripe_price_id).
// Server resolves the Stripe price via a service-role catalog lookup.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  type StripeEnv,
  createStripeClient,
  resolveOrCreateCustomer,
} from "../_shared/stripe.ts";

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

const POST_TARGETED = new Set(["royal_boost", "vote_boost", "crown_spotlight", "crown_shield"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json(401, { error: "Unauthorized" });

    // JWT-bound client to identify the caller only
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData, error: authErr } = await userClient.auth.getUser();
    if (authErr || !userData?.user) return json(401, { error: "Unauthorized" });

    const userId = userData.user.id;
    const userEmail = userData.user.email ?? undefined;

    // Service-role client for catalog + Stripe price lookup (bypasses column revoke)
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({}));
    const {
      bundle_id,
      boost_bundle_id,
      environment,
      target_post_id,
    } = body as {
      bundle_id?: string;
      boost_bundle_id?: string;
      environment?: StripeEnv;
      target_post_id?: string;
    };

    if (environment !== "sandbox" && environment !== "live") {
      return json(400, { error: "environment required" });
    }
    if (!bundle_id && !boost_bundle_id) {
      return json(400, { error: "bundle_id or boost_bundle_id required" });
    }
    if (bundle_id && typeof bundle_id !== "string") return json(400, { error: "Invalid bundle_id" });
    if (boost_bundle_id && typeof boost_bundle_id !== "string") return json(400, { error: "Invalid boost_bundle_id" });

    // Resolve catalog row + Stripe price with service role
    let lookupKey: string | null = null;
    let productLabel = "Purchase";
    let boostType: string | null = null;
    let validatedPostId: string | null = null;

    if (bundle_id) {
      const { data: bundle } = await admin
        .from("shekel_bundles")
        .select("id, stripe_price_id, label, active")
        .eq("id", bundle_id)
        .maybeSingle();
      if (!bundle || !(bundle as { active: boolean }).active) {
        return json(400, { error: "Invalid product" });
      }
      lookupKey = (bundle as { stripe_price_id: string }).stripe_price_id;
      productLabel = (bundle as { label: string }).label;
    } else if (boost_bundle_id) {
      const { data: boost } = await admin
        .from("boost_bundles")
        .select("id, stripe_price_id, boost_type, label, active")
        .eq("id", boost_bundle_id)
        .maybeSingle();
      if (!boost || !(boost as { active: boolean }).active) {
        return json(400, { error: "Invalid product" });
      }
      lookupKey = (boost as { stripe_price_id: string }).stripe_price_id;
      boostType = (boost as { boost_type: string }).boost_type;
      productLabel = (boost as { label: string }).label;

      if (POST_TARGETED.has(boostType!)) {
        if (!target_post_id || typeof target_post_id !== "string") {
          return json(400, { error: "Select a post to boost" });
        }
        const { data: post } = await admin
          .from("posts")
          .select("id, user_id, is_removed")
          .eq("id", target_post_id)
          .maybeSingle();
        if (
          !post ||
          (post as { is_removed: boolean }).is_removed ||
          (post as { user_id: string }).user_id !== userId
        ) {
          return json(400, { error: "You can only boost your own posts" });
        }
        validatedPostId = (post as { id: string }).id;
      }
    }

    if (!lookupKey) return json(400, { error: "Invalid product" });

    const stripe = createStripeClient(environment);
    const prices = await stripe.prices.list({ lookup_keys: [lookupKey], limit: 1 });
    if (!prices.data.length) return json(400, { error: "Price not found" });
    const stripePrice = prices.data[0];

    const customerId = await resolveOrCreateCustomer(stripe, { email: userEmail, userId });

    const productId = typeof stripePrice.product === "string"
      ? stripePrice.product
      : stripePrice.product.id;
    const product = await stripe.products.retrieve(productId);

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      ui_mode: "embedded_page",
      redirect_on_completion: "never",
      line_items: [{ price: stripePrice.id, quantity: 1 }],
      customer: customerId,
      payment_intent_data: { description: product.name || productLabel },
      metadata: {
        user_id: userId,
        userId,
        ...(bundle_id ? { bundle_id } : {}),
        ...(boost_bundle_id ? { boost_bundle_id } : {}),
        ...(validatedPostId ? { target_post_id: validatedPostId } : {}),
      },
    } as unknown as Parameters<typeof stripe.checkout.sessions.create>[0]);

    return json(200, { clientSecret: session.client_secret, sessionId: session.id });
  } catch (err) {
    console.error("create-checkout error:", err);
    return json(500, { error: "Couldn't start checkout. Try again." });
  }
});
