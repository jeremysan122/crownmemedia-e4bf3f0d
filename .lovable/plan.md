## Goal

Make "Go Live Battle" impossible to miss, guarantee the create→enter flow works end-to-end, give voters clear feedback while an optimistic vote is pending vs confirmed by realtime, and make Live Battle E2E runs deterministic.

## 1. Surface the Go Live Battle CTA everywhere

Add the CTA to these surfaces, all gated on `live_battles_enabled`:

- **Battle Arena `/battles`** — already has it. No change.
- **Live lobby `/battles/live`** — add a persistent "Go Live" button in the header (currently only lists ongoing rooms).
- **Battle history `/battles/history`** — add a "Start Live Battle" secondary CTA next to "New challenge".
- **Profile → Challenge sheet (`ChallengeDialog`)** — mode toggle already exists behind the flag. Show it unconditionally; when the flag is off, render a disabled toggle with a tooltip "Live battles unlock soon" instead of hiding it entirely.
- **Bottom sheet from the compose FAB** — add a "Go Live" row next to "New post" (only when flag is on).

### Empty state when hidden

Wherever we hide the Live CTA because the flag is off (or the user is signed out), render a compact explainer card:

```text
Live Battles
Real-time 1v1 face-offs with viewer voting and gifts. Unlocking soon — you'll see the button here when it opens.
```

This replaces the current silent hide, so testers understand why they don't see the button.

## 2. Complete Create → Start → Enter flow

`CreateLiveBattleDialog` already handles opponent search, category, region, duration, and calls `createLiveBattle` → `/live/:id`. Gaps to close:

- **Pre-flight guard**: block submit when opponent is banned, blocked, or self.
- **Countdown-to-start**: after RPC returns, show a 5-second "Get ready…" splash in the dialog with a cancel button (calls `live_battle_cancel`), then navigate.
- **LiveBattle join step**: already exists but currently shows raw `joinStep`. Add a visible "Waiting for @opponent…" state with a live countdown until `ends_at`; if opponent doesn't accept within 60s, show a "Battle expired — try again" CTA.
- **Toast → route**: on successful create, navigate immediately with `state: { justCreated: true }` so `/live/:id` can show a "Room opened" toast without a re-fetch race.

## 3. Optimistic vs confirmed vote UI

In `LiveBattle.tsx` `handleVote`:

- Track `pendingChoice: "host" | "opponent" | null` and `lastConfirmedAt` timestamps.
- While pending:
  - Show a small pulsing "Counting your vote…" chip next to the tally.
  - Disable both vote buttons (already done via `voting`) and add `aria-busy="true"`.
- On realtime UPDATE for the battle row (already subscribed), stamp `lastConfirmedAt = Date.now()` and briefly flash a "✓ Vote confirmed" chip that fades after 1.2s.
- On RPC failure: rollback (already done) + red "Vote didn't stick — try again" chip.
- Add `data-testid` hooks: `vote-pending`, `vote-confirmed`, `vote-failed` for E2E.

## 4. Deterministic E2E seed

Add a Node script `e2e/seed-live-battles.ts` (run in Playwright `globalSetup`) using the service-role key:

- Idempotently upsert 3 test users A/B/C (already exist via env — reuse IDs).
- Insert one **fresh live battle** per test file with a stable `room_name` prefix (`e2e-live-<test-slug>-<runId>`), `started_at = now`, `ends_at = now + 15min`.
- Reset `live_battle_votes` and `live_battle_gifts` for that room before each test.
- Wipe rooms with prefix `e2e-live-` older than 1 hour to keep the DB clean.
- Export helpers: `seedLiveBattle({ slug, durationSeconds })`, `resetLiveBattle(id)`, `endLiveBattle(id, at)`.

Existing specs (`live-battle-multi-vote`, `live-battle-gift-recipient-mapping`, `live-battle-gift-popup`) switch to these helpers.

## 5. E2E — voting at start and end of window

New spec `e2e/live-battle-vote-window.spec.ts`:

- **Start of window**: seed battle with `started_at = now`, `ends_at = now + 15min`. Cast a vote as viewer C, assert 200 and DB row inserted.
- **Just before end**: fast-forward the battle by patching `ends_at = now + 2s` via admin, wait 3s, cast a vote, assert RPC rejects with `battle_ended` and no row inserted.
- **After end**: patch `status = 'ended'`, cast, assert rejection matches `battle_not_live` and UI shows the "Battle has already ended" toast.

Assertions match the backend rules already enforced in `live_battle_vote`.

## Technical notes

- No schema changes required. All work is client-side + E2E infra.
- No new secrets; uses existing `SUPABASE_SERVICE_ROLE_KEY` in CI.
- New file count: ~4 (empty-state component, seed helper, vote-window spec, small chip component). Edits to `BattlesHub`, `LiveBattlesLobby`, `BattlesHistory`, `ChallengeDialog`, `CreateLiveBattleDialog`, `LiveBattle`.
- Feature flag remains authoritative; hidden state now explains itself instead of vanishing.

## Out of scope

- Server-side changes to `live_battle_vote` (rules already correct).
- Redesign of the arena — CTAs slot into existing layout.
- LiveKit token flow changes.

Approve and I'll implement in that order.
