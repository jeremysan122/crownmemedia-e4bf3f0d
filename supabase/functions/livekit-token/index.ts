// Mints a short-lived LiveKit access token for a live battle room.
// - Requires an authenticated user (JWT verified in code).
// - Verifies the `live_battles_enabled` feature flag.
// - Verifies the user is allowed to join: host, opponent, or a viewer that
//   is not blocked. Only host/opponent get publish permission.
// - Enforces per-user rate limits via the shared `rate_limits` table.
// - Never exposes LIVEKIT_API_SECRET to the client — the secret is only used
//   inside this function to sign the JWT.
// - Logs usage into `error_logs` with a `livekit_token_minted` event so
//   Platform Health can chart cost/usage.

import { createClient } from "npm:@supabase/supabase-js@2";
import { AccessToken } from "npm:livekit-server-sdk@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const TOKEN_TTL_SECONDS = 60 * 10; // 10 minutes; client reconnects can re-mint

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const lkUrl = Deno.env.get("LIVEKIT_URL");
  const lkKey = Deno.env.get("LIVEKIT_API_KEY");
  const lkSecret = Deno.env.get("LIVEKIT_API_SECRET");

  if (!lkUrl || !lkKey || !lkSecret) {
    return json({ error: "Live battles aren't available right now." }, 503);
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "Please sign in to join." }, 401);

  const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
  const { data: claims } = await userClient.auth.getClaims(authHeader.replace("Bearer ", ""));
  const uid = claims?.claims?.sub;
  if (!uid) return json({ error: "Please sign in to join." }, 401);

  const admin = createClient(url, svc);

  // Feature-flag gate.
  const { data: flagEnabled } = await admin.rpc("is_feature_enabled", { _key: "live_battles_enabled" });
  if (!flagEnabled) return json({ error: "Live battles aren't available right now." }, 403);

  const body = await req.json().catch(() => ({}));
  const battleId = String(body?.battle_id ?? "");
  const mode = body?.mode === "lobby" ? "lobby" : "battle";
  if (!battleId) return json({ error: "Missing battle." }, 400);

  // Rate limit per user: 30 mints / minute (covers reconnects).
  const { error: rlErr } = await userClient.rpc("enforce_rate_limit", {
    _action_key: `livebattle:join`, _max_count: 30, _window_seconds: 60,
  });
  if (rlErr) return json({ error: "You're joining too fast. Try again in a moment." }, 429);

  const { data: battle, error: bErr } = await admin
    .from("live_battles")
    .select("id, host_id, opponent_id, room_name, status, is_hidden, ends_at")
    .eq("id", battleId)
    .maybeSingle();
  if (bErr || !battle) return json({ error: "This battle isn't available." }, 404);
  if (battle.is_hidden) return json({ error: "This battle isn't available." }, 403);
  if (battle.status === "live" && battle.ends_at && new Date(battle.ends_at).getTime() <= Date.now()) {
    // The minute cron is authoritative; this closes the small gap between its
    // ticks and guarantees an expired room can never mint another token.
    await admin.rpc("finalize_expired_battles");
    return json({ error: "This battle has ended." }, 410);
  }
  if (battle.status === "ended" || battle.status === "cancelled" || battle.status === "declined") {
    return json({ error: "This battle has ended." }, 410);
  }

  const isHost = uid === battle.host_id;
  const isOpponent = uid === battle.opponent_id;

  if (mode === "lobby") {
    // Lobby is participants-only, pre-live only. Used for AV pre-check
    // without triggering the auto-start behavior below.
    if (!isHost && !isOpponent) {
      return json({ error: "Only battlers can enter the lobby." }, 403);
    }
    if (battle.status !== "pending" && battle.status !== "scheduled") {
      return json({ error: "The lobby is closed — battle is already live or ended." }, 409);
    }
  } else {
    if (battle.status === "scheduled") {
      return json({ error: "This battle hasn't started yet." }, 409);
    }
    // Blocked-user gate for viewers on the main room only.
    if (!isHost && !isOpponent) {
      const { data: blk } = await admin
        .from("blocks")
        .select("id")
        .or(`and(blocker_id.eq.${battle.host_id},blocked_id.eq.${uid}),and(blocker_id.eq.${battle.opponent_id},blocked_id.eq.${uid})`)
        .limit(1)
        .maybeSingle();
      if (blk) return json({ error: "You can't join this battle." }, 403);
    }

    // Start the battle when the opponent joins a pending challenge.
    if (isOpponent && battle.status === "pending") {
      // Use the user's client so `auth.uid()` is set correctly inside the RPC.
      await userClient.rpc("live_battle_start", { _battle_id: battle.id });
    }
  }

  const identity = uid;
  const roomName = mode === "lobby" ? `${battle.room_name}__lobby` : battle.room_name;
  const at = new AccessToken(lkKey, lkSecret, { identity, ttl: TOKEN_TTL_SECONDS });
  at.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish: isHost || isOpponent,
    canSubscribe: true,
    canPublishData: isHost || isOpponent,
  });


  const token = await at.toJwt();

  // Best-effort cost/usage log (Platform Health).
  await admin.from("error_logs").insert({
    user_id: uid,
    message: "livekit_token_minted",
    source: "monitoring",
    level: "info",
    metadata: {
      event: "livekit_token_minted",
      battle_id: battle.id,
      role: isHost ? "host" : isOpponent ? "opponent" : "viewer",
      ttl: TOKEN_TTL_SECONDS,
    },
  });

  return json({ token, url: lkUrl, room: roomName, ttl: TOKEN_TTL_SECONDS });
});

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
