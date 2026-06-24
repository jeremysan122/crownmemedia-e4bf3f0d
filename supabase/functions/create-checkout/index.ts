// Creates a Lovable-managed Stripe embedded-checkout session for Shekel bundles
// or Boost bundles. Returns { clientSecret } for the client to mount inline.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  type StripeEnv,
  createStripeClient,
  resolveOrCreateCustomer,
} from "../_shared/stripe.ts";
import { safeReturnUrl } from "../_shared/origin.ts";

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json(401, { error: "Unauthorized" });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !userData?.user) return json(401, { error: "Unauthorized" });

    const userId = userData.user.id;
    const userEmail = userData.user.email ?? undefined;

    const body = await req.json().catch(() => ({}));
    const { price_id, environment, return_url, target_post_id } = body as {
      price_id?: string;
      environment?: StripeEnv;
      return_url?: string;
      target_post_id?: string;
    };

    if (!price_id || typeof price_id !== "string" || price_id.length > 128) {
      return json(400, { error: "price_id required" });
    }
    if (environment !== "sandbox" && environment !== "live") {
      return json(400, { error: "environment required" });
    }

    // Validate price_id against active bundle catalog (RLS-scoped via user JWT)
    const [{ data: validBundle }, { data: validBoost }] = await Promise.all([
      supabase.from("shekel_bundles").select("id").eq("stripe_price_id", price_id).eq("active", true).maybeSingle(),
      supabase.from("boost_bundles").select("id, boost_type").eq("stripe_price_id", price_id).eq("active", true).maybeSingle(),
    ]);
    if (!validBundle && !validBoost) return json(400, { error: "Invalid product" });

    // Post-targeted boosts require an owned post
    const POST_TARGETED = new Set(["royal_boost", "vote_boost", "crown_spotlight", "crown_shield"]);
    let validatedPostId: string | null = null;
    if (validBoost && POST_TARGETED.has((validBoost as { boost_type: string }).boost_type)) {
      if (!target_post_id || typeof target_post_id !== "string") {
        return json(400, { error: "Select a post to boost" });
      }
      const { data: post } = await supabase
        .from("posts").select("id, user_id, is_removed")
        .eq("id", target_post_id).maybeSingle();
      if (!post || (post as { is_removed: boolean }).is_removed || (post as { user_id: string }).user_id !== userId) {
        return json(400, { error: "You can only boost your own posts" });
      }
      validatedPostId = (post as { id: string }).id;
    }

    const stripe = createStripeClient(environment);

    // Resolve Lovable Payments price by lookup_key (stable across sandbox/live)
    const prices = await stripe.prices.list({ lookup_keys: [price_id], limit: 1 });
    if (!prices.data.length) return json(400, { error: "Price not found in Stripe" });
    const stripePrice = prices.data[0];

    // Resolve a Customer up front so userId lives on the Customer object
    const customerId = await resolveOrCreateCustomer(stripe, {
      email: userEmail,
      userId,
    });

    // Description for one-off charges → shows in payments dashboard
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
      payment_intent_data: { description: product.name },
      metadata: {
        user_id: userId,
        userId,
        ...(validatedPostId ? { target_post_id: validatedPostId } : {}),
      },
    } as any);

    return json(200, { clientSecret: session.client_secret, sessionId: session.id });
  } catch (err) {
    console.error("create-checkout error:", err);
    return json(500, { error: (err as Error).message || "Failed to create checkout session" });
  }
});
