// Creates a Lovable-managed Stripe embedded-checkout session for the
// Verification subscription ($1.99/mo). Uses the "verification_monthly" lookup key.
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

const VERIFICATION_LOOKUP_KEY = "verification_monthly";

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
    const { environment, return_url } = body as { environment?: StripeEnv; return_url?: string };
    if (environment !== "sandbox" && environment !== "live") {
      return json(400, { error: "environment required" });
    }

    const stripe = createStripeClient(environment);
    const prices = await stripe.prices.list({ lookup_keys: [VERIFICATION_LOOKUP_KEY], limit: 1 });
    if (!prices.data.length) return json(400, { error: "Verification price not found in Stripe" });
    const stripePrice = prices.data[0];

    const customerId = await resolveOrCreateCustomer(stripe, { email: userEmail, userId });
    const returnBase = safeReturnUrl(req, return_url ?? "/verification", "/verification");

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      ui_mode: "embedded_page",
      line_items: [{ price: stripePrice.id, quantity: 1 }],
      customer: customerId,
      metadata: { user_id: userId, userId, kind: "verification" },
      subscription_data: {
        metadata: { user_id: userId, userId, kind: "verification" },
      },
      return_url: `${returnBase}?session_id={CHECKOUT_SESSION_ID}&kind=verification`,
    } as any);

    return json(200, { clientSecret: session.client_secret });
  } catch (err) {
    console.error("create-verification-checkout error:", err);
    return json(500, { error: (err as Error).message || "Failed to create checkout session" });
  }
});
