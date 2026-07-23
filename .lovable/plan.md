# Live Battles + LiveKit — Production Audit (read-only)

No files, DB rows, secrets, or deploys were changed. Findings below are grounded in the current repo, migrations, edge functions, and the configured secret list.

## 1. Relevant file paths

Client (React)
- `src/pages/LiveBattle.tsx` (1088 lines) — main stage: `LiveKitRoom`, `RoomAudioRenderer`, `ControlBar`, viewer heartbeat, PiP, gifts, emotes, comments, mod panels.
- `src/pages/BattleLobby.tsx`, `src/pages/LiveBattlesLobby.tsx`, `src/pages/BattleDetail.tsx`, `src/pages/Battles.tsx`, `src/pages/BattlesHub.tsx`, `src/pages/BattlesHistory.tsx`, `src/pages/BattlerAnalytics.tsx`.
- `src/components/battles/*` — `LobbyRoom.tsx`, `LobbyReadyPanel.tsx`, `LobbyCountdown.tsx`, `AVPreCheck.tsx`, `CreateLiveBattleDialog.tsx`, `AcceptBattleDialog.tsx`, `ChallengeDialog.tsx`, `ScheduleBattleSheet.tsx`, `LiveBattleComments.tsx`, `LiveBattleGiftsOverlay.tsx`, `LiveBattleGiftPicker.tsx`, `LiveBattleEmoteBurst.tsx`, `LiveBattleVoteChip.tsx`, `LiveBattlePiPButton.tsx`, `LiveBattleActivityLog.tsx`, `BattleModerationPanel.tsx`, `BeautyFilterPanel.tsx`, `RematchButton.tsx`, `WinnerReveal.tsx`, `OfficialResultBadge.tsx`, `ShareBattleDialog.tsx`, `LiveBattleShareCard.tsx`, `TopBattlersWidget.tsx`, `TournamentBracket.tsx`, `UpcomingBattlesStrip.tsx`, `LiveNowStrip.tsx`, `PendingInvitesList.tsx`, `FollowBattlerButton.tsx`, `BattleFilterBar.tsx`, `BattleHistoryList.tsx`, `LiveBattleEmptyState.tsx`, `CreateTournamentDialog.tsx`.
- `src/lib/liveBattles.ts`, `src/lib/liveBattleRealtime.ts`, `src/lib/battleScore.ts`, `src/lib/battleHighlight.ts`, `src/lib/battleModeration.ts`, `src/lib/battlesLogic.ts`, `src/lib/battlesPagination.ts`, `src/lib/battlesErrors.ts`.
- Hooks: `src/hooks/useLiveBattlePresence.ts`, `useLiveBattleViewers.ts`, `useBattleAlerts.ts`, `useOfficialBattleResult.ts`, `useViewerSafety.ts`.
- Tests: `src/components/battles/__tests__/*` (`BattleArenaWave1`, `LiveBattleEmoteBurst`, `LiveBattleGiftsOverlay.safety`, `LiveBattleVoteChip`, `LobbyCountdown`, `LobbyReadyPanel`, `livekitTokenLobbyRoom`), `src/lib/__tests__/liveBattlesLaunchGate.test.ts`. E2E: 40+ `e2e/live-battle-*.spec.ts`.

Server (edge functions)
- `supabase/functions/livekit-token/index.ts` — mints `AccessToken`, mode `battle` or `lobby`.
- `supabase/functions/livekit-room-control/index.ts` — mute/unmute/kick/end/force_end via `RoomServiceClient`.
- No `livekit-webhook` function.

Migrations (representative)
- `20260710001836_*` — core `live_battles`, `live_battle_votes`, `live_battle_participants`, `live_battle_reports`, `live_battle_start`, `live_battle_end`, `live_battle_vote`, `live_battle_log_action`.
- `20260710005458_*`, `20260710010307_*` — `create_live_battle` RPC (flag+rate-limit+block gate, mints `room_name`).
- `20260710012023_*`, `20260710012449_*` — `live_battle_report`, admin queue RPCs.
- `20260710014027_*` — `live_battle_accept/decline/cancel` + notify payloads (`live_battle_*`).
- Feature flag: `live_battles_enabled` via `is_feature_enabled` (`20260523004617_*`, `20260524025600_*`, `20260611160855_*`).
- Rate limits: `enforce_rate_limit` (`20260709164556_*`).

Deps: `@livekit/components-react ^2.9.23`, `@livekit/components-styles ^1.2.0`, `livekit-client ^2.20.1` (client). Edge functions import `npm:livekit-server-sdk@2` at request time (no pinned deno.json).

## 2. What is already implemented

- **A/V publishing** — Host + opponent publish camera/mic through `LiveKitRoom` in `LiveBattle.tsx` and `LobbyRoom.tsx`; `canPublish=true` only for participants; viewers `canSubscribe` only.
- **Room naming** — Server RPC `create_live_battle` mints `room_name`; edge function appends `__lobby` suffix for pre-check room (separate from live room; no side effects on lobby entry).
- **Token issuance** — `livekit-token` verifies JWT via `getClaims`, feature flag, blocks, per-user 30/min rate limit; 10-minute TTL; refuses `scheduled`, `ended`, `cancelled`, `declined`, `is_hidden`; closes the ends_at-window gap by calling `finalize_expired_battles`.
- **Battle lifecycle** — RPCs: `create`, `accept`, `decline`, `cancel`, `schedule`, `set_lobby_ready`, `start_battle_from_lobby`, `live_battle_start` (auto-fires when opponent joins pending), `live_battle_end`, `finalize_expired_battles` (minute cron).
- **Lobby** — `BattleLobby.tsx` + `LobbyRoom.tsx` + `LobbyReadyPanel` + `LobbyCountdown` with server-time offset; 5-second sync countdown; navigate to `/live/:id` only at zero or when already live+past `go_live_at`.
- **Reconnect** — `LiveKitRoom onError`/`onDisconnected` clears token → re-mint on remount; `livekit-token` idempotent for reconnects (rate limit sized for it).
- **Device controls** — `ControlBar variation="minimal"` (mic + camera), `BeautyFilterPanel`, PiP via `LiveBattlePiPButton`.
- **Voting** — `live_battle_vote` RPC + `LiveBattleVoteChip`; participants blocked; per-user single vote.
- **Comments** — `LiveBattleComments` overlay, server keyword/mute/slow-mode/comments-lock enforcement.
- **Gifts** — `LiveBattleGiftsOverlay` + `LiveBattleGiftPicker`; recipient mapping tested.
- **Moderation** — `livekit-room-control` (mute/unmute/kick/end/force_end) admin/mod/host-gated, writes `live_battle_log_action`, calls `live_battle_end` for `end`/`force_end`, then `rooms.deleteRoom`. `BattleModerationPanel` for keyword/slow/lock. Reports via `live_battle_report` with admin queue RPCs (`admin_list_live_battle_reports`, `admin_update_live_battle_report_status`).
- **Blocks** — Enforced in `livekit-token` (viewer path) and in emote/report RPCs.
- **Abuse / rate limits** — `enforce_rate_limit` on token mint, emote (`live_battle_send_emote`), report, create, schedule.
- **Cleanup** — Minute cron `finalize_expired_battles`; edge function calls it inline when a request lands in the gap; `deleteRoom` on host/force end.
- **Analytics** — Every token mint writes `error_logs {event: livekit_token_minted, role}`. Viewer heartbeat + count RPCs; `LiveBattleActivityLog`.
- **Mobile / Capacitor** — Capacitor 6 (android/ios/app/push/splash) present; no LiveKit-specific native plugin (works over WebRTC in WKWebView/Chromium).
- **Accessibility** — `role="alert"`, `aria-label` on loaders, ARIA-live comments/typing regression tests, reduced-motion e2e coverage.
- **Error states** — `liveBattleErrorMessage`, `lobbyErrorMessage`, `scheduleErrorMessage`, `emoteErrorMessage` translate every server code to a user-safe string.
- **Secret hygiene** — `liveBattlesLaunchGate.test.ts` fails the build if `LIVEKIT_API_SECRET`/`LIVEKIT_SECRET` ever appear in `src/`.

## 3. Missing or unsafe production items

Priority 1 — actual gaps
- **No LiveKit webhook receiver.** No `supabase/functions/livekit-webhook/*` and no `LIVEKIT_WEBHOOK_SECRET` secret. Room-finished / participant-left / egress events cannot flip DB state, so a crashed host or a room the API says is empty relies solely on the minute cron and the client-side end button. Zombie live rooms can persist up to `ends_at` and burn LiveKit minutes.
- **`livekit-server-sdk` pulled from npm at request time.** `import { RoomServiceClient } from "npm:livekit-server-sdk@2"` in both functions with no deno lockfile / import map — cold-start fetch failure = 500 for token mint or mod control. Consider pinning to a specific patch (`npm:livekit-server-sdk@2.13.2` or whatever is current) and adding an `import_map.json`.
- **No egress / recording pipeline** (nothing under `functions/`, no `EgressClient` import, no `battle_recordings` table). If VOD / replay / DMCA takedown material is a launch requirement, it's not there.
- **Host abandonment / room TTL.** LiveKit room `emptyTimeout` / `maxParticipants` are not passed on `CreateRoom` (rooms are auto-created on first join). A `livekit-webhook` `room_finished` → `live_battle_end('host_disconnect')` is the standard fix.
- **`live_battle_end` on the mod path** is called with the **user client** (`userClient.rpc(...)`) for `force_end`. If the RPC is `SECURITY DEFINER` and gates purely on `auth.uid()`, an admin who is not a participant may not satisfy the gate; verify RPC allows admin/mod roles or switch that call to the admin client with an explicit actor arg.
- **`error_logs`-based cost telemetry.** Every join writes a row; there is no aggregated `livekit_minutes_used` snapshot. Fine for launch, but a `db_health_snapshots`-style rollup helps guard against runaway spend.

Priority 2 — small hardening
- Token mint sets no `metadata` (name/avatar). Client renders names from `profiles` fetch — fine, but LiveKit `identity` is the raw uid; consider setting `name` = username so `ParticipantTile` shows the right label even before profiles load.
- `livekit-room-control` uses `lkUrl.replace(/^wss?:\/\//, "https://")` — assumes LIVEKIT_URL is `wss://…`. Add an explicit early check + friendly 503 if not.
- No `simulcast`, `adaptiveStream`, `dynacast` toggles configured on `LiveKitRoom` — defaults are OK but explicit is safer for mobile.
- `livekit-token` writes `error_logs` even on viewer joins; consider sampling or moving to a dedicated `livekit_usage` table.
- CORS import `npm:@supabase/supabase-js@2/cors` is non-standard; verify at deploy — most projects define a local `corsHeaders` const.

## 4. Current test / build / typecheck results

Not re-run in this audit (plan mode is read-only). Prior turn on this project reported: **Unit: 1106 pass**, **Typecheck: pass**, **ESLint: clean**; E2E infra flakes on some specs but no product regressions. Launch-gate test enforces (a) `create_live_battle` never bypassed by direct insert, (b) notification `live_battle_*` deep-linking, (c) no `LIVEKIT_API_SECRET` in client bundle sources.

Secrets present (names only — no values inspected): **`LIVEKIT_URL` ✅**, **`LIVEKIT_API_KEY` ✅**, **`LIVEKIT_API_SECRET` ✅**, **`LIVEKIT_WEBHOOK_SECRET` ❌ missing**.

## 5. Minimal implementation plan (preserves current battle behavior; keeps `LIVEKIT_API_SECRET` server-only)

Only changes needed to close the gaps above. No client-side use of the API secret; all new code lives in edge functions + migrations.

Step 1 — Add `livekit-webhook` edge function (new)
- Path: `supabase/functions/livekit-webhook/index.ts`, `verify_jwt = false` in `supabase/config.toml`.
- Verify with `WebhookReceiver(lkKey, lkSecret)` from `livekit-server-sdk` (requires `LIVEKIT_WEBHOOK_SECRET` = the same API secret configured in the LiveKit dashboard webhook, or a dedicated secret if the dashboard supports it — LiveKit signs with the API key/secret pair by default, so no new secret is strictly required; add `LIVEKIT_WEBHOOK_SECRET` only if the dashboard is configured with a distinct value).
- Map events → DB via service-role client:
  - `room_finished` → `live_battle_end(_battle_id, _force := false, _reason := 'room_finished')` looked up by `room_name` (strip `__lobby` suffix, no-op).
  - `participant_left` for host with `disconnect_reason` in `{CLIENT_INITIATED, ROOM_DELETED}` and battle still `live` after N seconds → `live_battle_end('host_left')` via a small `pg_cron`-friendly RPC or delayed check.
  - `egress_ended` (if egress is added later) → write `battle_recordings` row.
- Idempotency: dedupe on `(event_id)` inserted into a small `livekit_webhook_events` table.

Step 2 — Pin server SDK + import map
- Add `supabase/functions/livekit-token/deno.json` and `livekit-room-control/deno.json` (or a shared `import_map.json`) pinning `livekit-server-sdk` to a specific patch version. Update the two `import` statements to use the mapped specifier.

Step 3 — Room creation defaults
- In `livekit-token` when `mode === "battle"` and the room may not exist yet, call `rooms.createRoom({ name, emptyTimeout: 90, maxParticipants: 200 })` (best-effort; ignore `AlreadyExists`). Keeps zombie rooms from lingering.

Step 4 — Correct actor on `force_end`
- In `livekit-room-control`, when `action === "force_end"`, call `admin.rpc("live_battle_end", {_battle_id, _force: true, _reason: "admin_force_end", _actor_id: uid})` (add `_actor_id` param to the RPC in a small migration) so admins/mods without participant status can end without failing `auth.uid()` checks.

Step 5 — Token metadata
- `at.identity = uid`; add `at.name = profile.username ?? "Battler"` (fetch inside the same edge call — one row).

Step 6 — Usage rollup (optional, low-risk)
- New migration + minute cron: aggregate `error_logs` where `metadata->>event = 'livekit_token_minted'` into `daily_usage_rollups` with `metric = 'livekit_joins'`. Add an admin alert rule when joins exceed a configured threshold.

Step 7 — Secret step (owner action, not code)
- If a distinct webhook secret is chosen: add `LIVEKIT_WEBHOOK_SECRET` in Project Settings → Secrets. Otherwise reuse the existing `LIVEKIT_API_KEY`/`LIVEKIT_API_SECRET` pair for `WebhookReceiver`. Either way, the secret stays server-only.

Step 8 — Tests
- Extend `liveBattlesLaunchGate.test.ts` to assert:
  - `livekit-webhook` handler rejects unsigned bodies (401) and dedupes by event_id.
  - `create_live_battle` still not bypassed.
  - `LIVEKIT_WEBHOOK_SECRET` (if used) not in `src/`.
- Add a small e2e: host disconnect → room_finished webhook → battle transitions to `ended` within one cron tick.

Explicitly out of scope for this minimum: recording/egress pipeline, VOD storage, DMCA takedown UI, dedicated LiveKit-native Capacitor plugin. Flag these as separate waves if desired.
