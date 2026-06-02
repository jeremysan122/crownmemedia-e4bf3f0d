# Cloud Spend & Usage Intelligence

Admin-only dashboard inside Command Center that **estimates** cloud cost drivers from internal app metrics + configurable pricing assumptions. Clearly labeled "ESTIMATE" — never presented as actual Workspace/Lovable billing.

## Scope guardrails

To ship something useful without bloating the app, I'm pulling these levers:

- **No new client-side event firehose.** Adding `usage_events` writes on every avatar/feed/scroll render would inflate DB rollback rate (already 9%), increase egress, and cost more than it measures. Instead I'll **derive feature usage from data the app already writes**: `analytics_events` (already exists, privacy-safe), `posts`, `votes`, `comments`, `messages`, `notifications`, storage object metadata, `function_edge_logs` (analytics warehouse), and the new `db_health_snapshots`.
- **Lightweight new tracking only where the existing tables don't cover it:** share-card downloads, crown-map opens, scrolls views, feed opens — added as `analytics_events` rows (table already exists with privacy-safe hashing), **not** a new high-volume `usage_events` table.
- **Daily rollup is computed by a Postgres function on a cron**, queried by the dashboard. The dashboard never aggregates raw events live.

## Database

New migration:

1. `cloud_cost_assumptions` — provider, metric_key (unique), unit_name, unit_cost numeric, currency, notes, updated_by, updated_at. Seeded with reasonable defaults (storage $0.021/GB/mo, egress $0.09/GB, edge invocations $2/M, avg post image 1.5 MB, avg avatar 80 KB, avg share card 350 KB). Admin-only RLS.
2. `daily_usage_rollups` — date, feature, metric_key, total_count bigint, total_bytes bigint, estimated_cost numeric, metadata jsonb. Unique on (date, feature, metric_key). Admin-only read.
3. `cost_alert_rules` — name, metric_key, feature, threshold_type (`pct_change_dod`, `pct_change_wow`, `absolute`), threshold_value, comparison_window, is_active, created_by. Admin-only.
4. `cost_alerts` — rule_id, metric_key, feature, severity, message, current_value, previous_value, percent_change, acknowledged. Admin-only. Reuse existing `admin_alerts` for the global notification surface; `cost_alerts` is the per-rule ledger.
5. `billing_reconciliations` — period_start, period_end, actual_charge_usd, estimated_cost_usd (snapshot), notes, created_by. Admin-only.

New SECURITY DEFINER functions (service-role-only EXECUTE):

- `compute_daily_usage_rollup(d date)` — aggregates that day's `posts` (uploads & storage growth), `votes`, `comments`, `messages`, `notifications`, `analytics_events` grouped by `category`/`event_name`, storage object growth per bucket. Writes to `daily_usage_rollups`. Computes per-row `estimated_cost` from `cloud_cost_assumptions`.
- `evaluate_cost_alerts()` — for every active rule, compares the latest rollup to its baseline (dod / 7-day avg). Inserts to `cost_alerts` and `admin_alerts` when threshold crossed.

Cron (via `supabase--insert`, not migration): runs both at 00:10 UTC daily.

## Frontend

New page `src/pages/admin/CommandCenterCloudSpend.tsx` with tabbed sections:

1. **Overview** — estimated cost today, this week, this month, projected end-of-month, top cost driver. Sparkline trends.
2. **Cost Projection** — daily growth rate, 7d/30d trend lines, naive linear forecast.
3. **Feature Attribution** — table grouping rollup rows by feature (Feed, Scrolls, Profile, Crown Map, Leaderboard, Voting, Comments, DMs, Notifications, Verification, Share Cards, Royal Pass, Admin) with media loads, est egress GB, edge invocations, est cost, % share.
4. **Alerts** — list `cost_alerts` (filter by acknowledged), create/edit `cost_alert_rules` (name, metric, threshold type, value, window).
5. **Billing Reconciliation** — admin pastes actual Workspace charge for a period; UI computes delta vs. our estimate. Export buttons for CSV (7d, 30d, custom range) including assumptions used + disclaimer.
6. **Settings** — editable `cloud_cost_assumptions` table.

Add nav entry "Cloud Spend" in `CommandCenterLayout`.

## Lightweight client tracking

Add 6 new `analytics_events` event names, fired once per session-screen view (not per media load) using a small debounced helper `src/lib/usageTrack.ts`:

- `feed_opened`, `scrolls_opened`, `crown_map_opened`, `leaderboard_opened`, `post_viewed`, `share_card_downloaded`

These slot into the existing `analytics_events` table (privacy-safe, user_hash only) and feed the daily rollup. Fired with `requestIdleCallback` so they never block UI. **No per-image-load tracking** — egress is estimated from `posts.media_url` count × avg size from assumptions.

## Honesty / labelling

- Every cost figure on the dashboard is prefixed "Est." and the page header reads "Estimate — not a billing invoice. Reconcile against Workspace → Billing."
- Billing Reconciliation tab lets admins record the real number and shows variance.

## Performance

- Dashboard reads `daily_usage_rollups` only (small: ~50 rows/day × 30 days = 1.5k rows). No raw aggregation on read.
- Indexes on rollups (date desc), assumptions (metric_key unique), alerts (created_at desc, acknowledged).
- Tracking helper batches client events through existing `analytics.track()` (already on the page).

## Security

- All new tables: RLS enabled, admin-only via `is_any_admin(auth.uid())`. Service-role grants for the cron functions.
- No service-role keys reach the frontend (existing pattern).
- Dashboard route wrapped in `AdminRoute` (existing).

## Files

**Migration (one):** the 5 tables + 2 functions + grants + RLS.
**Insert (cron):** schedule both jobs + seed `cloud_cost_assumptions`.
**New code:**
- `src/pages/admin/CommandCenterCloudSpend.tsx`
- `src/components/admin/cc/CostAssumptionsEditor.tsx`
- `src/components/admin/cc/AlertRulesEditor.tsx`
- `src/components/admin/cc/BillingReconciliation.tsx`
- `src/lib/usageTrack.ts` (thin wrapper around existing `analytics.track`)
**Edits:**
- `src/App.tsx` (lazy route)
- `src/pages/admin/CommandCenterLayout.tsx` (nav entry)
- 6 page-level tracking calls in `Feed.tsx`, `Shorts.tsx`, `CrownMap.tsx`, `Leaderboard.tsx`, `PostPage.tsx`, `ShareDialog.tsx`

## Out of scope / explicitly not built

- Real-time per-media-load egress tracking (cost > value at this scale).
- Pulling real Workspace billing programmatically (no API available to me — that's why Reconciliation exists).
- External email/SMS alerts (reuses internal `admin_alerts` only, per your instructions).
