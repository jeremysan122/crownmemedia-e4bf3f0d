# Crown System Completion — 4 Waves

Ships the remaining 12 gaps from the audit. Each wave is independently shippable and testable; after each I'll return with verification before starting the next.

## Wave 1 — Game Loop (turns art into rewards)

The highest-impact wave: right now only 3 users have crowns because the evaluator isn't wired end-to-end.

1. **Unlock evaluator RPC + cron**
   - `evaluate_crown_unlocks(user_id uuid)` — reads `requirement_logic` JSON for all 100 crowns, checks user stats (wins, streaks, votes, tournaments, etc.), inserts missing rows into `user_achievement_crowns`, updates `user_crown_progress`.
   - Trigger it on: battle end, tournament advance, daily streak tick, and a 5-minute reconciliation cron for stragglers.
   - Emit an analytics event per unlock.

2. **Unlock notifications**
   - Insert into `notifications` on unlock; push via existing push infra when enabled.
   - Show sonner toast on next page load; for `rarity IN ('rare','legendary')` open the existing celebratory modal.

3. **Progress bars on locked crowns**
   - `AchievementCrowns.tsx` locked tile reads `user_crown_progress.progress_current / progress_target` and renders a slim bar + "3 / 10 wins" label.

## Wave 2 — Discovery & Social

4. **Per-crown share page** at `/crown/:slug`
   - Public route showing artwork, rarity, holders count, unlock hint, "how to earn" CTA.
   - OG image via existing `share_cards` — reuse the crown's `gallery_asset_url` as the primary visual.

5. **Rarity stats** — "0.4% of players own this"
   - Materialized view `crown_rarity_stats(crown_id, holder_count, holder_pct)` refreshed hourly.
   - Displayed on the crown detail sheet and on `/crown/:slug`.

6. **Collection completion reward**
   - Completing all 10 in a collection grants a matching title (e.g. "Battle Sovereign") + one Royal Shield charge.
   - New table `crown_collection_rewards` mapping collection_slug → reward payload; grant runs inside `evaluate_crown_unlocks`.

## Wave 3 — Ops & Performance

7. **Asset preloading strategy**
   - Grid renders `thumbnail_url` (256px WebP) via `<img srcset>`; `gallery_asset_url` only on tap/hover/detail.
   - Add `loading="lazy"` + `decoding="async"` uniformly.

8. **CDN cache headers**
   - Verify + set `Cache-Control: public, max-age=31536000, immutable` on `achievement-crowns-v2` public bucket via storage update.

9. **Feature flag flip plan**
   - Confirm `crown_system_v2` flag state; add gradual rollout (admin → founders → 10% → 100%).

## Wave 4 — Cleanup

10. **001–010 path normalization** — copy the 10 masters to `masters/crown-NNN-master-2048.png` layout, update DB to match the rest, drop legacy paths.

11. **Move 001–010 masters to private bucket** — same treatment as 011–090; masters no longer publicly downloadable.

12. **`/admin/crown-assets` all-green dashboard** — verify it now reflects 100/100 verified + shows storage location per crown; add a "Rebuild derivatives" per-row action for future asset swaps.

## Technical notes

- All new SQL functions use `SECURITY DEFINER` + `SET search_path = public`.
- `evaluate_crown_unlocks` is idempotent via the `UNIQUE (user_id, crown_id)` constraint on `user_achievement_crowns`.
- New tables get GRANT + RLS in the same migration (per project convention).
- Wave 1's cron uses `pg_cron` + `pg_net` with the anon key via `supabase--insert` (not migration).
- Feature flag `crown_system_v2` gates the new evaluator so we can pause instantly if unlock rates spike.

## Verification per wave

- **W1:** run evaluator against a test user with known stats; confirm expected unlocks land, toast fires, progress bars render.
- **W2:** hit `/crown/battle-sovereign-i`, screenshot; confirm OG preview + rarity math against `count(*) / total_users`.
- **W3:** Playwright network audit — grid page should load thumbs (~10KB each) not full gallery WebPs.
- **W4:** re-run the audit script; expect 0 files in public bucket under `masters/` and 100/100 rows using the standardized path.

## Order of operations

Wave 1 → verify → Wave 2 → verify → Wave 3 → verify → Wave 4 → final GO report.

Approve to start Wave 1.