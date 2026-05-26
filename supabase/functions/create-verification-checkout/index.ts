// Creates a $1.99/mo Stripe Checkout subscription that fast-tracks verification.
// The actual Stripe price is provided via the STRIPE_VERIFICATION_PRICE_ID env var.
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
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;
    const userEmail = userData.user.email ?? undefined;

    const priceId = Deno.env.get("STRIPE_VERIFICATION_PRICE_ID");
    if (!priceId || !priceId.startsWith("price_")) {
      return new Response(JSON.stringify({
        error: "Verification subscription not configured. Admin must set STRIPE_VERIFICATION_PRICE_ID.",
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { return_path } = await req.json().catch(() => ({ return_path: "/verification" }));
    const successBase = safeReturnUrl(req, return_path ?? "/verification", "/verification");
    const cancelBase = safeReturnUrl(req, "/verification", "/verification");

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: userEmail,
      metadata: { user_id: userId, kind: "verification" },
      subscription_data: { metadata: { user_id: userId, kind: "verification" } },
      success_url: `${successBase}?session_id={CHECKOUT_SESSION_ID}&kind=verification`,
      cancel_url: `${cancelBase}?purchase=cancelled`,
    });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("create-verification-checkout error:", err);
    return new Response(JSON.stringify({ error: "Failed to create checkout session." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
