// Creates (or returns) a Stripe Express account + onboarding link for the caller
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { type StripeEnv, createStripeClient } from "../_shared/stripe.ts";
import { safeReturnUrl } from "../_shared/origin.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData, error: authErr } = await userClient.auth.getUser();
    if (authErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userId = userData.user.id;
    const email = userData.user.email ?? undefined;

    let body: { return_path?: string; environment?: StripeEnv } = {};
    try { body = await req.json(); } catch { /* no body is fine */ }
    const environment = body.environment;
    if (environment !== "sandbox" && environment !== "live") {
      return new Response(JSON.stringify({ error: "environment required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: existing } = await admin
      .from("connect_accounts").select("stripe_account_id")
      .eq("user_id", userId).maybeSingle();

    const stripe = createStripeClient(environment);
    let accountId = existing?.stripe_account_id;
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: "express",
        email,
        capabilities: { transfers: { requested: true } },
        metadata: { user_id: userId },
      });
      accountId = account.id;
      await admin.from("connect_accounts").insert({
        user_id: userId,
        stripe_account_id: accountId,
      });
    }

    const returnBase = safeReturnUrl(req, body.return_path ?? "/settings", "/settings");
    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${returnBase}?connect=refresh`,
      return_url: `${returnBase}?connect=done`,
      type: "account_onboarding",
    });

    return new Response(JSON.stringify({ url: link.url, account_id: accountId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("create-connect-account error:", err);
    return new Response(
      JSON.stringify({ error: "Failed to start Stripe onboarding. Please try again." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
