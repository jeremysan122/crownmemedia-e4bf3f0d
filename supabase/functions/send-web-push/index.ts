// Called by the `trg_send_push_on_notification` Postgres trigger via pg_net
// when a new row is inserted in public.notifications. Authenticates via a
// shared `x-trigger-secret` value stored in vault and verified through the
// `verify_web_push_trigger_secret` RPC.
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-trigger-secret",
};

const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:support@crownmemedia.com";

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
}

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
      return new Response(JSON.stringify({ error: "VAPID keys not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const secret = req.headers.get("x-trigger-secret") ?? "";
    const { data: ok, error: vErr } = await admin.rpc("verify_web_push_trigger_secret", { _secret: secret });
    if (vErr || !ok) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { notification_id } = (await req.json()) as { notification_id?: string };
    if (!notification_id) {
      return new Response(JSON.stringify({ error: "notification_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: n, error: nErr } = await admin
      .from("notifications")
      .select("id, user_id, type, title, body, payload")
      .eq("id", notification_id)
      .maybeSingle();
    if (nErr || !n) {
      return new Response(JSON.stringify({ error: "notification not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: subs, error: sErr } = await admin
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("user_id", n.user_id);
    if (sErr) throw sErr;

    const payloadStr = JSON.stringify({
      id: n.id,
      title: n.title,
      body: n.body ?? "",
      tag: n.id,
      payload: n.payload ?? {},
    });

    const results = await Promise.allSettled(
      (subs ?? []).map((s) =>
        webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payloadStr,
        ),
      ),
    );

    // Prune subscriptions that the push service rejected as gone.
    const deadEndpoints: string[] = [];
    results.forEach((r, i) => {
      if (r.status === "rejected") {
        const status = (r.reason as { statusCode?: number })?.statusCode;
        if (status === 404 || status === 410) deadEndpoints.push(subs![i].endpoint);
      }
    });
    if (deadEndpoints.length) {
      await admin.from("push_subscriptions").delete().in("endpoint", deadEndpoints);
    }

    return new Response(
      JSON.stringify({
        sent: results.filter((r) => r.status === "fulfilled").length,
        failed: results.filter((r) => r.status === "rejected").length,
        pruned: deadEndpoints.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("send-web-push error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
