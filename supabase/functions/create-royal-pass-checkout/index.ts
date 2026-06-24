// Creates a Lovable-managed Stripe embedded-checkout session for a Royal Pass plan.
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
    const { plan_id, price_id, environment, return_url } = body as {
      plan_id?: string;
      price_id?: string;
      environment?: StripeEnv;
      return_url?: string;
    };
    if (environment !== "sandbox" && environment !== "live") {
      return json(400, { error: "environment required" });
    }

    // Resolve plan: accept either plan_id (legacy) OR direct price_id (lookup key)
    let lookupKey = price_id;
    let resolvedPlanId: string | null = null;
    if (plan_id) {
      const { data: plan } = await supabase
        .from("royal_pass_plans")
        .select("id, stripe_price_id, name")
        .eq("id", plan_id)
        .eq("active", true)
        .maybeSingle();
      if (!plan) return json(400, { error: "Invalid plan" });
      lookupKey = (plan as { stripe_price_id: string }).stripe_price_id;
      resolvedPlanId = (plan as { id: string }).id;
    }
    if (!lookupKey) return json(400, { error: "plan_id or price_id required" });

    const stripe = createStripeClient(environment);
    const prices = await stripe.prices.list({ lookup_keys: [lookupKey], limit: 1 });
    if (!prices.data.length) return json(400, { error: "Royal Pass price not found in Stripe" });
    const stripePrice = prices.data[0];

    const customerId = await resolveOrCreateCustomer(stripe, { email: userEmail, userId });

    const returnBase = safeReturnUrl(req, return_url ?? "/store/success", "/store/success");

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      ui_mode: "embedded_page",
      line_items: [{ price: stripePrice.id, quantity: 1 }],
      customer: customerId,
      metadata: {
        user_id: userId,
        userId,
        kind: "royal_pass",
        ...(resolvedPlanId ? { plan_id: resolvedPlanId } : {}),
      },
      subscription_data: {
        metadata: {
          user_id: userId,
          userId,
          kind: "royal_pass",
          ...(resolvedPlanId ? { plan_id: resolvedPlanId } : {}),
        },
      },
      return_url: `${returnBase}?session_id={CHECKOUT_SESSION_ID}&kind=royal_pass`,
    } as any);

    return json(200, { clientSecret: session.client_secret });
  } catch (err) {
    console.error("create-royal-pass-checkout error:", err);
    return json(500, { error: (err as Error).message || "Failed to create checkout session" });
  }
});
