// Returns live Stripe Connect account status for the caller, and upserts it
// into connect_accounts so the UI can show Connected/Incomplete immediately
// after the user returns from onboarding (no waiting for the webhook).
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

function safeError(status: number, message: string, detail?: unknown) {
  if (detail) console.error("[connect-account-status]", message, detail);
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return safeError(401, "Unauthorized");

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData, error: authErr } = await userClient.auth.getUser();
    if (authErr || !userData?.user) return safeError(401, "Unauthorized");
    const userId = userData.user.id;

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: row } = await admin
      .from("connect_accounts")
      .select("stripe_account_id, charges_enabled, payouts_enabled, details_submitted")
      .eq("user_id", userId)
      .maybeSingle();

    if (!row?.stripe_account_id) {
      return new Response(JSON.stringify({ connected: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Pull live status from Stripe
    let acct;
    try {
      acct = await stripe.accounts.retrieve(row.stripe_account_id);
    } catch (err) {
      // Return cached row if Stripe is unreachable
      return new Response(
        JSON.stringify({
          connected: true,
          stripe_account_id: row.stripe_account_id,
          charges_enabled: row.charges_enabled,
          payouts_enabled: row.payouts_enabled,
          details_submitted: row.details_submitted,
          stale: true,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const next = {
      charges_enabled: !!acct.charges_enabled,
      payouts_enabled: !!acct.payouts_enabled,
      details_submitted: !!acct.details_submitted,
      updated_at: new Date().toISOString(),
    };

    // Upsert if anything changed
    if (
      next.charges_enabled !== row.charges_enabled ||
      next.payouts_enabled !== row.payouts_enabled ||
      next.details_submitted !== row.details_submitted
    ) {
      await admin
        .from("connect_accounts")
        .update(next)
        .eq("stripe_account_id", row.stripe_account_id);
    }

    const fully_set_up = next.charges_enabled && next.payouts_enabled && next.details_submitted;

    return new Response(
      JSON.stringify({
        connected: true,
        stripe_account_id: row.stripe_account_id,
        ...next,
        fully_set_up,
        requirements_due: (acct.requirements?.currently_due ?? []).length,
        requirements_disabled_reason: acct.requirements?.disabled_reason ?? null,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return safeError(500, "Could not fetch account status. Please try again.", err);
  }
});
