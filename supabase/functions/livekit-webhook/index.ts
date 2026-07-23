// LiveKit webhook receiver.
// - Verifies the signed body with LIVEKIT_API_KEY / LIVEKIT_API_SECRET
//   (WebhookReceiver from livekit-server-sdk).
// - Idempotency: every event id is inserted into `livekit_webhook_events`;
//   duplicates short-circuit with 200.
// - `room_finished` → live_battle_end_by_room(reason='room_finished').
// - `participant_left` for host with terminal disconnect reasons → mark the
//   battle ended with 'host_left'.
// - No JWT: the LiveKit signature IS the authentication.
//
// LIVEKIT_API_SECRET is only read inside this Deno function; it is never
// exposed to any client bundle.

import { createClient } from "npm:@supabase/supabase-js@2";
import { WebhookReceiver } from "npm:livekit-server-sdk@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, authorization-timestamp",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const lkKey = Deno.env.get("LIVEKIT_API_KEY");
  const lkSecret = Deno.env.get("LIVEKIT_API_SECRET");
  if (!lkKey || !lkSecret) return json({ error: "livekit_not_configured" }, 503);

  const authz = req.headers.get("authorization") ?? "";
  const bodyText = await req.text();

  let event: any;
  try {
    const receiver = new WebhookReceiver(lkKey, lkSecret);
    // Signature is in the Authorization header, per LiveKit spec.
    event = await receiver.receive(bodyText, authz);
  } catch (_e) {
    return json({ error: "invalid_signature" }, 401);
  }

  const admin = createClient(url, svc);
  const eventId: string = String(event?.id ?? "");
  const eventType: string = String(event?.event ?? "unknown");
  const roomName: string | null = event?.room?.name ?? null;
  const participantId: string | null = event?.participant?.identity ?? null;

  if (!eventId) return json({ ok: true, skipped: "missing_event_id" });

  // Idempotency insert. Unique on event_id — duplicates return without work.
  const { error: dupErr } = await admin.from("livekit_webhook_events").insert({
    event_id: eventId,
    event_type: eventType,
    room_name: roomName,
    participant_identity: participantId,
    raw: event,
  });
  if (dupErr) {
    // 23505 = unique_violation → duplicate delivery, treat as success.
    if ((dupErr as any).code === "23505") return json({ ok: true, dedup: true });
    return json({ error: "log_failed" }, 500);
  }

  try {
    if (eventType === "room_finished" && roomName) {
      await admin.rpc("live_battle_end_by_room" as never, {
        _room_name: roomName, _reason: "room_finished",
      } as never);
    } else if (eventType === "participant_left" && roomName && participantId) {
      // Only end when host leaves the live room (skip the lobby suffix).
      const cleanRoom = roomName.replace(/__lobby$/, "");
      const { data: battle } = await admin
        .from("live_battles")
        .select("id, host_id, status")
        .eq("room_name", cleanRoom)
        .maybeSingle();
      if (battle && battle.status === "live" && battle.host_id === participantId) {
        await admin.rpc("live_battle_end_by_room" as never, {
          _room_name: cleanRoom, _reason: "host_left",
        } as never);
      }
    }
  } catch (e) {
    await admin.from("error_logs").insert({
      message: "livekit_webhook_processing_failed",
      source: "monitoring",
      level: "warn",
      metadata: { event: eventType, event_id: eventId, err: String((e as Error)?.message ?? e) },
    });
    return json({ ok: false, error: "processing_failed" }, 500);
  }

  return json({ ok: true });
});

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
