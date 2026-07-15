# Royal Pass — Audit & Completion Plan

## Audit results (verified against code + DB)

Confirmed gaps in the current implementation:

| Area | Status | Evidence |
|---|---|---|
| Annual plan | ❌ Missing | `royal_pass_plans` has 1 row: `royal_pass_monthly` @ $9.99 only |
| Free trial | ❌ Missing | `create-royal-pass-checkout` sets no `trial_period_days`; webhook handles `trialing` status but nothing ever produces it |
| Gift Royal Pass | ❌ Missing | No gift flow in `create-royal-pass-checkout`, no `royal_pass_gifts` table |
| Renewal reminder email | ❌ Missing | No template in `_shared/transactional-email-templates/` |
| Cancellation confirmation email | ❌ Missing | `royal-pass-cancel` returns JSON only, no email |
| Win-back / dunning offer | ⚠️ Partial | Dunning banner shipped; no discount coupon flow |
| MRR / churn / LTV dashboard | ❌ Missing | No `MRR|churn|LTV|cohort` refs in `src/pages/admin/` |
| Manual grant / comp tool | ❌ Missing | Admin has reversal history but no "grant N days" UI |
| Royal-only crowns/frames | ❌ Missing | No `royal_pass_required` flag on `achievement_crowns` / `avatar_frames` |
| Royal quests (boosted rewards) | ❌ Missing | `weekly_quest_definitions` exists but has no royal multiplier |
| Public "What you get" page | ❌ Missing | Value prop only lives inside paywall card |
| Profile Royal badge | ✅ Shipped | `RoyalPassBadge.tsx` exists |
| Reversal history | ✅ Shipped | `RoyalPassReversalHistory.tsx` |
| Reconciliation cron | ✅ Shipped | `royal-pass-reconcile` function |

## Proposed waves

### Wave 1 — Monetization foundation (highest ROI)
1. Add **annual plan** row ($79.99/yr → "save 33%") + admin can toggle.
2. Update `RoyalPassCard.tsx` to show monthly/annual toggle with savings badge.
3. Add `trial_period_days` (7-day) option in `create-royal-pass-checkout`, gated by a feature flag.
4. Wire proration for monthly ↔ annual switch via existing `royal-pass-portal` (Stripe handles the math).

### Wave 2 — Retention comms
1. New app-email templates: `royal-pass-renewal-reminder` (T-3 days), `royal-pass-canceled`, `royal-pass-trial-ending`.
2. `pg_cron` job (daily 09:00 UTC) queries `royal_pass_subscriptions` for renewals in 3 days & trials ending in 2 days, invokes `send-transactional-email`.
3. `royal-pass-cancel` triggers the cancellation email with expiry date.

### Wave 3 — Growth loops
1. **Gift Royal Pass**: new `create-royal-pass-gift-checkout` fn (one-time price, recipient by @username), `royal_pass_gifts` table, redemption on webhook → `royal_pass_grants` with `source='gift'`.
2. **Public value page** at `/royal-pass` with SEO, hero, feature list, testimonials, CTA.
3. **Referral bonus**: existing `creator_referrals` — add "gift a friend Royal → get 1 month free" reward rule.

### Wave 4 — Ops & exclusivity
1. Admin **Manual Grant** tool in `CommandCenterFinance.tsx`: grant N days of Royal to any user (reason + audit row).
2. Admin **MRR/Churn/LTV** tile: SQL views on `royal_pass_subscriptions` + `payment_transactions`, render in `CommandCenterOverview.tsx`.
3. Add `royal_pass_required boolean` column to `achievement_crowns` and `avatar_frames`; gate equip RPCs; mark 3–5 assets as Royal-only.
4. Royal-boosted **weekly quests**: add `royal_multiplier numeric default 1.0` to `weekly_quest_definitions`; award RP subs 2× shekels on completion.

## Technical notes

- All Stripe calls route through the existing `createStripeClient(env)` shared utility — no new Stripe SDK usage.
- New tables (`royal_pass_gifts`) will include `GRANT` + RLS in the same migration per project rules.
- Renewal cron uses `pg_cron` + `net.http_post` to `send-transactional-email` (already-scaffolded transactional pipeline).
- Feature flags via existing `useFeatureFlag` hook so we can roll out trial + gifting gradually.
- Estimated: Wave 1 ≈ 1 session, Wave 2 ≈ 1 session, Wave 3 ≈ 1–2 sessions, Wave 4 ≈ 1–2 sessions.

## Recommended order

Ship **Wave 1 first** (biggest revenue lift — annual = ~2x LTV per subscriber, trial = ~30% conversion boost). Then Wave 2 (protects the base you just grew), then 3, then 4.

Reply "ship wave 1" (or pick a different wave) to begin.
