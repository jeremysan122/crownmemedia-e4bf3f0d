// Admin-only test harness: replays synthetic Stripe events to our two webhook endpoints
// using x-test-bypass-signature + service-role secret (no real Stripe call needed).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

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
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: authErr } = await userClient.auth.getClaims(token);
    if (authErr || !claims?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userId = claims.claims.sub as string;

    // Admin role check
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", userId);
    const isAdmin = (roles ?? []).some((r: { role: string }) => r.role === "admin");
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden — admin only" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json() as {
      kind: "checkout" | "payout_paid" | "payout_failed" | "account_updated";
      target_user_id?: string;
      shekels?: number;
      stripe_account_id?: string;
      amount_usd?: number;
    };

    const eventId = `evt_test_${crypto.randomUUID()}`;
    const targetUser = body.target_user_id || userId;
    let event: Record<string, unknown>;
    let endpoint: string;

    if (body.kind === "checkout") {
      event = {
        id: eventId,
        type: "checkout.session.completed",
        data: {
          object: {
            id: `cs_test_${crypto.randomUUID()}`,
            metadata: {
              user_id: targetUser,
              test_shekels: String(body.shekels ?? 1000),
            },
          },
        },
      };
      endpoint = `${Deno.env.get("SUPABASE_URL")}/functions/v1/stripe-webhook`;
    } else if (body.kind === "account_updated") {
      event = {
        id: eventId,
        type: "account.updated",
        account: body.stripe_account_id,
        data: {
          object: {
            id: body.stripe_account_id,
            charges_enabled: true,
            payouts_enabled: true,
            details_submitted: true,
          },
        },
      };
      endpoint = `${Deno.env.get("SUPABASE_URL")}/functions/v1/stripe-connect-webhook`;
    } else {
      const status = body.kind === "payout_paid" ? "payout.paid" : "payout.failed";
      event = {
        id: eventId,
        type: status,
        account: body.stripe_account_id,
        data: {
          object: {
            id: `po_test_${crypto.randomUUID()}`,
            amount: Math.round((body.amount_usd ?? 25) * 100),
          },
        },
      };
      endpoint = `${Deno.env.get("SUPABASE_URL")}/functions/v1/stripe-connect-webhook`;
    }

    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-test-bypass-signature": "1",
        "x-test-secret": Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      },
      body: JSON.stringify(event),
    });
    const text = await res.text();

    return new Response(JSON.stringify({
      sent_event_id: eventId,
      endpoint,
      status: res.status,
      response: text,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("test-harness error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
