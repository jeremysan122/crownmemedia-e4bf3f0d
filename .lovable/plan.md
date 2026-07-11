# Battle Arena v2 — Close the Gaps

Building on Live Battles v1 (1v1, voting, gifts, comments, moderation), this plan ships the eight missing areas in staged waves so we can launch value early and de-risk the heavier work.

## Wave 1 — Discovery & Scheduling (foundation)

**Goal:** people can find, follow, and plan around battles.

1. **Filters on `/battles`**
   - Add category, region, stakes (gift tier), and status (live / upcoming / ended) filter chips in `BattlesHub.tsx`.
   - Persist selection in URL search params so filters are shareable.
2. **Follow-a-battler + notify-on-live**
   - New table `battler_follows (follower_id, battler_id)`.
   - Trigger on `live_battles` insert → fan-out `notifications` + push to followers with type `battle_going_live`.
3. **Schedule for later**
   - Add `scheduled_start_at`, `state='scheduled'` to `live_battles`.
   - `ScheduleBattleSheet.tsx` for hosts; scheduled battles appear in Upcoming tab.
   - Add-to-calendar (ICS) button — shipped in Wave 1.

## Wave 1.5 — Scheduled battle reminder job (BLOCKS public scheduling launch)

**Goal:** users get a push/notification before their scheduled battle starts.

Deferred out of Wave 1 because `pg_cron` + `pg_net` need enable + a project-specific schedule row containing the function URL and anon key (not migration-safe).

Before public launch of scheduling:
1. Add `battle-reminders` edge function that scans `live_battles WHERE status='scheduled' AND scheduled_start_at BETWEEN now()+14m AND now()+16m`, inserts a `notifications` row (`payload.kind='battle_reminder'`, `payload.link=/live/:id`) for host + opponent, and (best-effort) fans out web push.
2. Schedule it every minute via `cron.schedule('battle-reminders-1m', '* * * * *', ...)` using `supabase--insert` (NOT a migration — carries project-specific secrets).
3. Add an idempotency guard column (e.g. `reminder_sent_at`) so the reminder fires exactly once.
4. Add a test that the RPC/function marks reminders sent, or document a clear skip reason if `pg_cron` is unavailable in the target env.

## Wave 2 — Pre-battle Lobby ✅ shipped

**Goal:** battles start clean, not chaotic.

1. **Warmup lobby room** (`/battles/:battleId/lobby`) with:
   - AV pre-check: camera preview, mic level meter, network signal (`AVPreCheck.tsx`).
   - Ready-state panel with host / opponent flags, host "Go live" gated on both (`LobbyReadyPanel.tsx`).
   - Synchronized go-live countdown with polite `aria-live` announcements (`LobbyCountdown.tsx`).
2. **Schema:** `live_battles` gained `host_ready`, `opponent_ready`, `lobby_opened_at`, `go_live_at`. RPCs `set_lobby_ready` and `start_battle_from_lobby` gate all writes server-side.
3. **LiveKit token** accepts `mode: "lobby"` — participants-only, `${room_name}__lobby`, no auto-start.
4. **Realtime:** existing `live_battles` UPDATE stream drives the lobby; status flip to `live` auto-navigates to `/live/:id`.

## Wave 3 — Spectator UX ✅ shipped

**Goal:** watching feels alive.

1. **Live viewer count** via Supabase Realtime Presence on `battle_presence:{id}` (`useLiveBattlePresence`), with the 15s heartbeat poll retained as fallback. `LiveBattle.tsx` header prefers presence and falls back to poll.
2. **Emote bursts** (`LiveBattleEmoteBurst.tsx`): 5 emote kinds (heart, crown, fire, clap, laugh) broadcast on `battle_emotes:{id}`. Server RPC `live_battle_send_emote` enforces feature gate, blocks check, and a 30/10s per-user rate limit. Respects `prefers-reduced-motion`.
3. **Picture-in-Picture** (`LiveBattlePiPButton.tsx`): native `requestPictureInPicture()` when supported, else a floating info card with a "Return to battle" CTA.

## Wave 4 — Battler Tools (moderation shipped; broadcast beauty filter deferred to Wave 4.5)

**Goal:** hosts feel in control on-camera.

1. **Self-view filter** (`BeautyFilterPanel.tsx`) ✅ shipped as *preview only*: brightness / contrast / smoothing (blur) applied via a scoped CSS `filter` on the host's own `<video>` tile. Settings persist in `localStorage` (`cm.battle.beauty.v1`). **Viewers still see the raw camera feed** — the UI is explicitly labeled "Self-view filter" and carries an inline note to set expectations. A real broadcast beauty filter is tracked in Wave 4.5 below.
2. **Battle moderation panel** (`BattleModerationPanel.tsx`) ✅ shipped: host or moderator can lock chat, pick a slow-mode interval (0/5/10/30/60s), and manage up to 32 keyword filters. All writes go through the `set_battle_moderation` RPC (host + admin/mod only). New column `live_battles.comments_locked`, plus hardened `live_battle_comments` INSERT policy that enforces lock + slow mode + keyword filter server-side.
3. **Chat integration** (`LiveBattleComments.tsx`) ✅ shipped: composer disables + shows the locked/slow-mode reason, blocked keywords are rejected locally with a toast, and filtered messages render as `[filtered by host]` for defense-in-depth if any slip past the policy.

## Wave 4.5 — Broadcast beauty filter (BLOCKS public "beauty filter" launch)

**Goal:** viewers see the same treated feed the host sees.

Deferred out of Wave 4 because publishing a replacement track requires care: it interacts with LiveKit's camera track lifecycle, `simulcast` layers, and mobile Safari's `canvas.captureStream()` quirks.

Before we advertise "beauty filters" publicly:
1. Grab the local camera `MediaStreamTrack` from LiveKit's `LocalParticipant` (Camera source).
2. Draw it into an offscreen `<canvas>` per animation frame with `ctx.filter = beautyCssFilter(...)` (or a WebGL fragment shader for smoothing quality).
3. Take the processed track via `canvas.captureStream(30).getVideoTracks()[0]` and swap it in with `LocalVideoTrack.replaceTrack(newTrack, /* stopProcessor */ false)`.
4. On disable, restore the original camera track and stop the canvas RAF loop + processed track to release the GPU/CPU cost.
5. Handle unmount cleanup (component teardown, disconnect, tab hidden) so we never leak a canvas capture that keeps the camera light on.
6. Add tests for enable → publish, disable → restore, and unmount cleanup. Smoke-test on Safari iOS (known `captureStream` pitfalls).
7. Only after all of the above ships can the toolbar label revert from "Self-view filter" to "Beauty filter".

## Accepted scanner warnings (Wave 4)

The two new `warn`-level findings introduced by Wave 4 are known-safe and match the pattern already accepted across the project:
- `set_battle_moderation` — `SECURITY DEFINER` RPC (needed to bypass RLS for host/mod writes) with a mutable `search_path`. The function pins `search_path = public` at the top and does its own `not_authorized` / `battle_not_found` / `invalid_slow_mode` checks before any write. Callable by `authenticated` only, not `anon`.
- `live_battle_body_matches_keyword` — pure helper used by the `live_battle_comments` INSERT policy; `SECURITY DEFINER` is required so the policy can read `live_battles.keyword_filters` regardless of the caller's SELECT rights. No side-effects, no dynamic SQL.

Neither introduces a new policy risk. They're bundled into the existing `docs/security/linter-findings/0028-anon-security-definer.md` / `0029-authenticated-security-definer.md` acceptance rationale.





## Wave 5 — Structure (Tournaments & Rematches) ✅ shipped

**Goal:** more than one-off matches.

1. **Rematch CTA** ✅ shipped on the ended battle results screen (`RematchButton.tsx`). New `create_rematch(_battle_id)` RPC verifies the caller is host/opponent of an ended battle, re-checks the block relationship + `live_battles_enabled` flag, shares the `livebattle:create` 5/hour rate-limit bucket, and mints a fresh `pending` battle with the same opponent, category, region, and duration. Caller becomes the new host and lands on `/live/:id`.
2. **Tournaments (single-elim, 4/8/16)** ✅ shipped:
   - Schema: `tournaments` (title, size, status, winner_id, current_round, category, region, duration) + `tournament_matches` (round, slot, host_id, opponent_id, battle_id, winner_id, `next_match_id`/`next_slot` wiring, status). Signed-in users can read; all writes go through RPCs.
   - `create_tournament(title, size, participants[], category, region, duration)` builds every round's empty match rows, wires next-match/next-slot links top-down, then seeds round 1 sequentially. Enforces size (4/8/16), participant uniqueness/count, feature flag, and a `tournament:create` 3/hour rate limit.
   - `start_tournament_match(match_id)` — creator, participant, admin, or moderator opens the live battle for a `ready` bracket slot. Creates a `live_battles` row wired to the match and navigates to `/battles/:id/lobby`.
   - `tg_tournament_advance` trigger — when `live_battles.status` flips to `ended`, the winner (or host on tie/no-winner) is slotted into `next_match_id` at `next_slot`; the child match flips to `ready` once both sides are filled. When the final ends, the tournament is marked `completed` with a `winner_id`.
   - UI: `/tournaments` list, `/tournaments/:id` bracket detail with realtime subscription on `tournament_matches` + `tournaments`, `TournamentBracket.tsx` renderer (round headers, per-match status pills, Start / Watch controls), `CreateTournamentDialog.tsx` (title + size + @username participants, resolves handles → ids, seeds pairs in order). BattlesHub gets a "Tournaments" tile in the explore grid.

### Accepted scanner warnings (Wave 5)

The new Wave 5 findings match the earlier accepted `SECURITY DEFINER` pattern (see `docs/security/linter-findings/0028-anon-security-definer.md` / `0029-authenticated-security-definer.md`): every new function pins `search_path = public`, does its own `not_authenticated` / `not_authorized` / participant checks, and is granted only to `authenticated`. The trigger function `tg_tournament_advance` runs `SECURITY DEFINER` so it can update `tournament_matches` regardless of which participant ended the battle — but it only ever mirrors data from the source `live_battles` row (winner, status) that was itself gated by the existing battle-end RPCs.

## Wave 6 — Post-battle ✅ shipped

**Goal:** the moment doesn't die when the timer hits zero.

1. **Shareable highlight card** ✅ — `get_live_battle_highlight(battle_id)` RPC returns host/opponent profiles, per-side gift totals, top 3 gifters, and peak viewers. `LiveBattle` results screen shows real usernames, a "Top gifters" panel, and passes real names into `LiveBattleShareCard` for the PNG.
2. **Performance analytics** ✅ — new column `live_battles.peak_viewers` (bumped every presence tick via `bump_live_battle_peak_viewers`) plus `get_battler_battle_analytics(user_id, limit)` RPC (self/admin/mod only). New page `/battles/analytics` (`BattlerAnalytics.tsx`) shows lifetime summary and last 25 ended battles with peak viewers, votes, gift shekels, and top supporter per battle.
3. **Rematch + "Notify me next time" CTAs** ✅ — `RematchButton` (from Wave 5) sits on the results screen alongside a viewer-only "Notify me next time" row that reuses `FollowBattlerButton` for both battlers (rides the Wave 1 `battler_follows` + `battle_going_live` notification pipeline).

### Accepted scanner warnings (Wave 6)

Three new `warn`-level findings match the accepted `SECURITY DEFINER` pattern (see `docs/security/linter-findings/0028-anon-security-definer.md` / `0029-authenticated-security-definer.md`): every new function pins `search_path = public`, is granted only to `authenticated`, and enforces its own auth checks (`not_authenticated` on all; `not_authorized` on the analytics RPC when the caller is neither the target user nor admin/moderator). `bump_live_battle_peak_viewers` only ever raises the ceiling and clamps the input range, so a hostile caller can't lower or wildly inflate it.


## Wave 7 — Safety hardening

**Goal:** viewer-level control matches host-level control.

1. **In-battle block/mute** for viewers (client + server-side hide of that user's comments/gifts).
2. **Global keyword filter list** per viewer (`muted_words` — reuse existing table).
3. **Report-viewer flow** parallel to existing comment reports.

## Technical Details

- **Realtime**: reuse the shared realtime bus; add channels `battle_lobby:{id}` and `battle_presence:{id}`.
- **Schema additions**: `battler_follows`, `tournaments`, `tournament_rounds`, `tournament_matches`, plus columns on `live_battles` (`scheduled_start_at`, `keyword_filters jsonb`, `slow_mode_seconds`).
- **RLS**: every new table gets GRANTs + policies in the same migration; follows/keyword filters scoped by `auth.uid()`.
- **Notifications**: extend the `notifications.type` enum with `battle_going_live`, `battle_reminder`, `tournament_match_ready`, `rematch_invite`.
- **Edge functions**: `schedule-battle-reminder` (cron), `tournament-advance` (trigger on battle end), `share-highlight-card`.
- **Accessibility**: every new interactive surface gets `aria-live` where state changes are announced (already the standard in this codebase).
- **E2E**: add specs per wave covering filter persistence, lobby ready-state, PiP fallback, tournament advancement, viewer mute, and reminder toasts.

## Rollout order

Wave 1 → 2 → 3 → 4 → 5 → 6 → 7. Each wave is independently shippable behind a feature flag (`feature_flags` table already exists).

Approve and I'll start with Wave 1.
