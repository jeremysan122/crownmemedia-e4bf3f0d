// Server-side LiveKit room controls: mute a participant, kick, or force-end.
// - Only host, admin, or moderator may act.
// - Uses LIVEKIT_API_SECRET (never exposed to client).
// - Also writes an audit row via `live_battle_log_action` and, for end/kick,
//   flips DB state via `live_battle_end`.

import { createClient } from "npm:@supabase/supabase-js@2";
import { RoomServiceClient } from "npm:livekit-server-sdk@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const lkUrl = Deno.env.get("LIVEKIT_URL");
  const lkKey = Deno.env.get("LIVEKIT_API_KEY");
  const lkSecret = Deno.env.get("LIVEKIT_API_SECRET");
  if (!lkUrl || !lkKey || !lkSecret) return json({ error: "Live battles aren't available right now." }, 503);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "Please sign in." }, 401);
  const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
  const { data: claims } = await userClient.auth.getClaims(authHeader.replace("Bearer ", ""));
  const uid = claims?.claims?.sub;
  if (!uid) return json({ error: "Please sign in." }, 401);

  const body = await req.json().catch(() => ({}));
  const action = String(body?.action ?? "");
  const battleId = String(body?.battle_id ?? "");
  const target = body?.target_user_id ? String(body.target_user_id) : null;
  if (!battleId || !["mute", "unmute", "kick", "end", "force_end"].includes(action)) {
    return json({ error: "Invalid request." }, 400);
  }

  const admin = createClient(url, svc);

  const { data: battle } = await admin
    .from("live_battles")
    .select("id, host_id, opponent_id, room_name, status")
    .eq("id", battleId)
    .maybeSingle();
  if (!battle) return json({ error: "This battle isn't available." }, 404);

  const { data: isAdmin } = await admin.rpc("has_role", { _user_id: uid, _role: "admin" });
  const { data: isMod } = await admin.rpc("has_role", { _user_id: uid, _role: "moderator" });
  const privileged = Boolean(isAdmin) || Boolean(isMod);
  const isHost = uid === battle.host_id;

  if (action === "force_end" && !privileged) return json({ error: "You can't do that." }, 403);
  if (["mute", "unmute", "kick"].includes(action) && !(isHost || privileged)) {
    return json({ error: "Only the host can do that." }, 403);
  }
  if (action === "end" && !(isHost || uid === battle.opponent_id || privileged)) {
    return json({ error: "Only participants can end the battle." }, 403);
  }

  const rooms = new RoomServiceClient(lkUrl.replace(/^wss?:\/\//, "https://"), lkKey, lkSecret);

  try {
    if (action === "kick" && target) {
      await rooms.removeParticipant(battle.room_name, target);
      await userClient.rpc("live_battle_log_action", { _battle_id: battle.id, _target: target, _action: "kick" });
    } else if ((action === "mute" || action === "unmute") && target) {
      // Mute all published tracks for that participant.
      const p = await rooms.getParticipant(battle.room_name, target).catch(() => null);
      if (p?.tracks) {
        for (const t of p.tracks) {
          await rooms.mutePublishedTrack(battle.room_name, target, t.sid, action === "mute").catch(() => {});
        }
      }
      await userClient.rpc("live_battle_log_action", { _battle_id: battle.id, _target: target, _action: action });
    } else if (action === "end" || action === "force_end") {
      await userClient.rpc("live_battle_end", {
        _battle_id: battle.id,
        _force: action === "force_end",
        _reason: action === "force_end" ? "admin_force_end" : "host_end",
      });
      await rooms.deleteRoom(battle.room_name).catch(() => {});
    }
  } catch (e) {
    await admin.from("error_logs").insert({
      user_id: uid,
      message: "livekit_room_control_failed",
      source: "monitoring",
      level: "warn",
      metadata: { event: "livekit_room_control_failed", action, battle_id: battleId, err: String((e as Error)?.message ?? e) },
    });
    return json({ error: "Something went wrong. Please try again." }, 500);
  }

  return json({ ok: true });
});

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
