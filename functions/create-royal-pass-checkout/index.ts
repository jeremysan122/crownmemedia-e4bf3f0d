// Creates a Stripe Checkout session for a Royal Pass subscription plan
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
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
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
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;
    const userEmail = userData.user.email ?? undefined;

    const { plan_id, return_path } = await req.json();
    if (!plan_id || typeof plan_id !== "string") {
      return new Response(JSON.stringify({ error: "plan_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: plan } = await supabase
      .from("royal_pass_plans")
      .select("id, stripe_price_id, name")
      .eq("id", plan_id)
      .eq("active", true)
      .maybeSingle();

    if (!plan) {
      return new Response(JSON.stringify({ error: "Invalid plan" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (
      !plan.stripe_price_id.startsWith("price_") ||
      plan.stripe_price_id.endsWith("_placeholder")
    ) {
      return new Response(
        JSON.stringify({
          error:
            "Royal Pass not yet configured — admin needs to set the Stripe price ID for this plan.",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const successBase = safeReturnUrl(req, return_path ?? "/store/success", "/store/success");
    const cancelBase = safeReturnUrl(req, return_path ?? "/store", "/store");

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: plan.stripe_price_id, quantity: 1 }],
      customer_email: userEmail,
      metadata: { user_id: userId, plan_id: plan.id, kind: "royal_pass" },
      subscription_data: {
        metadata: { user_id: userId, plan_id: plan.id, kind: "royal_pass" },
      },
      success_url: `${successBase}?session_id={CHECKOUT_SESSION_ID}&kind=royal_pass`,
      cancel_url: `${cancelBase}?purchase=cancelled&tab=pass`,
    });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("create-royal-pass-checkout error:", err);
    return new Response(
      JSON.stringify({ error: "Failed to create checkout session." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
