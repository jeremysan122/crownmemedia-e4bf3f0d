// Admin-only: re-hydrate a user's royal_pass_subscriptions row directly from
// Stripe. Used by the "Refresh Entitlements" button in the UI for testing so
// admins don't need to wait for a webhook retry.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { type StripeEnv, createStripeClient } from "../_shared/stripe.ts";

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

const ADMIN_ROLES = new Set(["admin", "super_admin", "finance_admin"]);

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
    const callerId = userData.user.id;

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Enforce admin-only access via user_roles table
    const { data: roleRows } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId);
    const isAdmin = (roleRows ?? []).some((r: { role: string }) => ADMIN_ROLES.has(r.role));
    if (!isAdmin) return json(403, { error: "Admin role required" });

    const body = await req.json().catch(() => ({}));
    const { environment, target_user_id } = body as {
      environment?: StripeEnv;
      target_user_id?: string;
    };
    if (environment !== "sandbox" && environment !== "live") {
      return json(400, { error: "environment required" });
    }
    const targetId = target_user_id || callerId;

    // Look up the existing row (if any) to find stripe_customer_id
    const { data: sub } = await admin
      .from("royal_pass_subscriptions")
      .select("stripe_customer_id, stripe_subscription_id, plan_id")
      .eq("user_id", targetId)
      .maybeSingle();

    const stripe = createStripeClient(environment);

    // Find the latest subscription for this user in Stripe. Prefer metadata
    // search on userId (set by create-checkout), then fall back to the
    // stripe_customer_id we already have on file.
    let stripeSub: Awaited<ReturnType<typeof stripe.subscriptions.retrieve>> | null = null;

    try {
      const results = await stripe.subscriptions.search({
        query: `metadata['userId']:'${targetId}'`,
        limit: 5,
      });
      if (results.data.length > 0) {
        // pick the most recently created
        stripeSub = results.data.sort((a, b) => b.created - a.created)[0] as any;
      }
    } catch (_e) {
      // Search API can be flaky in test mode; fall through to customer list
    }

    if (!stripeSub && sub?.stripe_customer_id) {
      const list = await stripe.subscriptions.list({
        customer: sub.stripe_customer_id,
        status: "all",
        limit: 5,
      });
      if (list.data.length > 0) {
        stripeSub = list.data.sort((a, b) => b.created - a.created)[0] as any;
      }
    }

    if (!stripeSub) {
      return json(404, {
        error: "No Stripe subscription found for this user",
        target_user_id: targetId,
      });
    }

    // Extract period end (Basil moved it onto items; keep the fallback for
    // older payloads).
    const item = (stripeSub as any).items?.data?.[0];
    const periodEnd = item?.current_period_end ?? (stripeSub as any).current_period_end ?? null;
    const periodStart = item?.current_period_start ?? (stripeSub as any).current_period_start ?? null;
    const customerId = typeof stripeSub.customer === "string"
      ? stripeSub.customer
      : (stripeSub.customer as any)?.id ?? null;

    const patch = {
      user_id: targetId,
      status: stripeSub.status,
      stripe_customer_id: customerId,
      stripe_subscription_id: stripeSub.id,
      cancel_at_period_end: !!stripeSub.cancel_at_period_end,
      current_period_start: periodStart ? new Date(periodStart * 1000).toISOString() : null,
      current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      updated_at: new Date().toISOString(),
    };

    const { error: upErr } = await admin
      .from("royal_pass_subscriptions")
      .upsert(patch, { onConflict: "user_id" });
    if (upErr) return json(500, { error: upErr.message });

    return json(200, {
      success: true,
      target_user_id: targetId,
      stripe_subscription_id: stripeSub.id,
      status: stripeSub.status,
      current_period_end: patch.current_period_end,
      cancel_at_period_end: patch.cancel_at_period_end,
    });
  } catch (err) {
    console.error("royal-pass-sync error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message || "Sync failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
