// Creates a Lovable-managed Stripe embedded-checkout session for a Royal Pass plan.
// Client sends plan_id only; server resolves stripe_price_id via service role.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  type StripeEnv,
  createStripeClient,
  isStripeEnvironmentEnabled,
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json(401, { error: "Unauthorized" });

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData, error: authErr } = await userClient.auth.getUser();
    if (authErr || !userData?.user) return json(401, { error: "Unauthorized" });
    const userId = userData.user.id;
    const userEmail = userData.user.email ?? undefined;

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({}));
    const { plan_id, environment } = body as {
      plan_id?: string;
      environment?: StripeEnv;
    };
    if (environment !== "sandbox" && environment !== "live") {
      return json(400, { error: "environment required" });
    }
    if (!isStripeEnvironmentEnabled(environment)) {
      return json(403, { error: "Sandbox checkout is disabled" });
    }
    if (!plan_id || typeof plan_id !== "string") {
      return json(400, { error: "plan_id required" });
    }

    const { data: plan, error: planError } = await admin
      .from("royal_pass_plans")
      .select("id, stripe_price_id, name, active")
      .eq("id", plan_id)
      .maybeSingle();
    if (planError) throw new Error(`Royal Pass plan lookup failed: ${planError.message}`);
    if (!plan || !(plan as { active: boolean }).active) {
      return json(400, { error: "Invalid plan" });
    }
    const lookupKey = (plan as { stripe_price_id: string }).stripe_price_id;
    const resolvedPlanId = (plan as { id: string }).id;

    const stripe = createStripeClient(environment);
    const prices = await stripe.prices.list({ lookup_keys: [lookupKey], limit: 1 });
    if (!prices.data.length) return json(400, { error: "Royal Pass price not found" });
    const stripePrice = prices.data[0];

    const customerId = await resolveOrCreateCustomer(stripe, { email: userEmail, userId });

    // Trial gated by feature flag `royal_pass_trial_enabled`. Only grant a trial
    // to users who have never held a Royal Pass subscription before.
    let trialPeriodDays: number | undefined;
    const { data: trialFlag, error: trialFlagError } = await admin
      .from("feature_flags")
      .select("enabled, rollout_percent")
      .eq("key", "royal_pass_trial_enabled")
      .maybeSingle();
    if (trialFlagError) throw new Error(`Trial flag lookup failed: ${trialFlagError.message}`);
    if (trialFlag?.enabled) {
      const { count: priorSubs, error: priorSubsError } = await admin
        .from("royal_pass_subscriptions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId);
      if (priorSubsError) throw new Error(`Prior subscription lookup failed: ${priorSubsError.message}`);
      if (!priorSubs || priorSubs === 0) trialPeriodDays = 7;
    }

    const subscriptionData: Record<string, unknown> = {
      metadata: {
        user_id: userId,
        userId,
        kind: "royal_pass",
        plan_id: resolvedPlanId,
      },
    };
    if (trialPeriodDays) subscriptionData.trial_period_days = trialPeriodDays;

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      ui_mode: "embedded_page",
      redirect_on_completion: "never",
      line_items: [{ price: stripePrice.id, quantity: 1 }],
      customer: customerId,
      metadata: {
        user_id: userId,
        userId,
        kind: "royal_pass",
        plan_id: resolvedPlanId,
        trial_days: trialPeriodDays ? String(trialPeriodDays) : "0",
      },
      subscription_data: subscriptionData,
    } as unknown as Parameters<typeof stripe.checkout.sessions.create>[0]);

    return json(200, { clientSecret: session.client_secret, sessionId: session.id });
  } catch (err) {
    console.error("create-royal-pass-checkout error:", err);
    return json(500, { error: "Couldn't start Royal Pass checkout. Try again." });
  }
});
