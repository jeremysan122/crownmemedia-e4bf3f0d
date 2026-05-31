// Creates a Stripe Checkout session for a Shekel bundle
import Stripe from "https://esm.sh/stripe@17.5.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { safeReturnUrl } from "../_shared/origin.ts";

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
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userId = userData.user.id;
    const userEmail = userData.user.email ?? undefined;

    const { price_id, return_path, target_post_id } = await req.json();
    if (!price_id || typeof price_id !== "string" || !price_id.startsWith("price_") || price_id.length > 255) {
      return new Response(JSON.stringify({ error: "price_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Validate the price_id corresponds to an active bundle (uses user's auth → RLS applies)
    const [{ data: validBundle }, { data: validBoost }] = await Promise.all([
      supabase.from("shekel_bundles").select("id").eq("stripe_price_id", price_id).eq("active", true).maybeSingle(),
      supabase.from("boost_bundles").select("id, boost_type").eq("stripe_price_id", price_id).eq("active", true).maybeSingle(),
    ]);
    if (!validBundle && !validBoost) {
      return new Response(JSON.stringify({ error: "Invalid product" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Post-targeted boosts require a post the user owns
    const POST_TARGETED = new Set(["royal_boost", "vote_boost", "crown_spotlight", "crown_shield"]);
    let validatedPostId: string | null = null;
    if (validBoost && POST_TARGETED.has((validBoost as { boost_type: string }).boost_type)) {
      if (!target_post_id || typeof target_post_id !== "string") {
        return new Response(JSON.stringify({ error: "Select a post to boost" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const { data: post } = await supabase
        .from("posts").select("id, user_id, is_removed")
        .eq("id", target_post_id).maybeSingle();
      if (!post || (post as { is_removed: boolean }).is_removed || (post as { user_id: string }).user_id !== userId) {
        return new Response(JSON.stringify({ error: "You can only boost your own posts" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      validatedPostId = (post as { id: string }).id;
    }

    const successBase = safeReturnUrl(req, return_path ?? "/store/success", "/store/success");
    const cancelBase = safeReturnUrl(req, return_path ?? "/store", "/store");

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: price_id, quantity: 1 }],
      customer_email: userEmail,
      metadata: {
        user_id: userId,
        ...(validatedPostId ? { target_post_id: validatedPostId } : {}),
      },
      success_url: `${successBase}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${cancelBase}?purchase=cancelled`,
    });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("create-checkout error:", err);
    return new Response(
      JSON.stringify({ error: "Failed to create checkout session. Please try again." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
