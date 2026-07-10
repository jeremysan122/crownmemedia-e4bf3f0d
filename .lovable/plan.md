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

## Wave 2 — Pre-battle Lobby

**Goal:** battles start clean, not chaotic.

1. **Warmup lobby room** (`/battles/:id/lobby`) with:
   - AV pre-check (mic level meter, camera preview, network test).
   - Battler ready state + host "Start" gated on both ready.
   - Countdown to go-live with `aria-live` announcements.
2. **Reuse existing realtime channel** for lobby presence + ready toggles.

## Wave 3 — Spectator UX

**Goal:** watching feels alive.

1. **Live viewer count** via presence channel; broadcast to `LiveBattle.tsx` header.
2. **Emote bursts** (tap-to-send hearts/crowns); rate-limited server-side (reuse typing throttle pattern).
3. **Picture-in-Picture** using the browser PiP API on the video element with a fallback floating card for unsupported browsers.

## Wave 4 — Battler Tools

**Goal:** hosts feel in control on-camera.

1. **Beauty / basic filters** (brightness, smoothing) via WebGL shader layer on the local track.
2. **Host moderation panel in-battle**: mute viewer, kick, lock comments, slow-mode toggle — reuses existing `live_battle_comment_reports` + `admin_audit_log` plumbing.
3. **Keyword filter** per battle; auto-hides matching comments before render.

## Wave 5 — Structure (Tournaments & Rematches)

**Goal:** more than one-off matches.

1. **Rematch CTA** on the results screen → creates a new `live_battles` row prefilled with same participants.
2. **Tournaments**
   - Tables: `tournaments`, `tournament_rounds`, `tournament_matches` (winner_id, next_match_id).
   - Bracket UI (`TournamentBracket.tsx`) with auto-advance on battle end.
   - Support 4/8/16-player single-elim in v1.

## Wave 6 — Post-battle

**Goal:** the moment doesn't die when the timer hits zero.

1. **Shareable highlight card** (existing `share_cards` infra) with winner, score, top gifters.
2. **Performance analytics** for each battler: peak viewers, votes over time, gift revenue, top supporters — visible on their dashboard only.
3. **Rematch + "Notify me next time" CTAs** on results screen.

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
