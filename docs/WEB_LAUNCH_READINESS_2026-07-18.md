# CrownMe web launch readiness — 2026-07-18

## Decision

**Current production: NO-GO until this branch is deployed and the live payment canary passes.**

**Code on `agent/web-launch-readiness`: release-candidate quality for a controlled web launch.**

This is a web-only assessment for the first approximately 1,000 registered
users. Native iOS/Android packaging, RevenueCat, App Store review, and Google
Play review are outside this launch gate. No software is literally flawless;
the release decision below is based on tested behavior, explicit failure
modes, and operational safeguards.

## Production evidence

- Signed-in route inspection covered Feed, Discover/Crown Map, Battles, live
  battle lobby, Store, Royal Pass, Messages, Creator Program, Preferences, and
  mobile Feed rendering.
- The production anonymous RLS probe reported `unsafe: false` across all
  sensitive tables it checks.
- The live Stripe webhook endpoint is reachable without a Supabase bearer and
  rejects an invalid live signature with HTTP 400.
- A read-only availability smoke sent 48 GET requests across six important web
  routes with concurrency 8: 48/48 returned HTTP 200; p50 was 422 ms, p95 was
  1,338 ms, and maximum was 1,399 ms.

The availability smoke is not a substitute for a sustained authenticated
database load test. One thousand registered users also does not imply one
thousand simultaneous users.

## Launch blockers fixed in this branch

### Payment and entitlement integrity

- Sandbox Stripe operations are server-disabled by default. The browser can no
  longer use a sandbox/test-card checkout to mint entitlements in production.
  `PAYMENTS_ENABLE_SANDBOX=true` is reserved for isolated controlled projects.
- Store currency and Boost fulfillment now runs in one idempotent database
  transaction guarded by a Checkout Session lock.
- The success-page purchase verifier uses the same atomic fulfillment path as
  the webhook; it no longer performs a second race-prone wallet update path.
- Stripe event receipt and completion are separate states. Failed events retry
  immediately, concurrent deliveries do not double-run, and abandoned claims
  become retryable after five minutes.
- Missing/invalid webhook environments fail closed instead of returning a 2xx
  acknowledgement that permanently loses the event.
- Database and RPC failures in Royal Pass, verification, payout, refund, and
  dispute handlers now propagate to Stripe for redelivery.
- Unknown paid line items fail closed instead of charging a user without a
  recognized fulfillment path.

### Product truthfulness and preferences

- Removed invented battle activity such as `620 vs 380`, `12h left`, and
  `1.2k watching` from the Battle Arena mode previews.
- Removed Preferences controls that only stored values but were not honored by
  the web product.
- The remaining default-category preference now preselects the Upload category.
- Reduce motion, larger text, and high contrast are applied globally and clear
  correctly at sign-out/session change.

## Verification results

- TypeScript: pass.
- ESLint: pass with 0 errors (the repository still has 166 pre-existing
  warnings, primarily React hook dependency and Fast Refresh warnings).
- Vitest: 133 files passed, 5 environment-dependent files skipped; 1,100 tests
  passed and 48 skipped.
- Production Vite build: pass.
- Modified edge-function parse check: pass for all 13 changed functions/shared
  modules.
- Focused payment, refund, wallet, battle, surface-inventory, and launch
  hardening regression tests: pass.

## Deployment order (required)

1. Apply database migrations:
   - `20260718010000_atomic_store_checkout_fulfillment.sql`
   - `20260718011000_retryable_stripe_event_claims.sql`
2. Deploy the changed Stripe checkout, verification, Royal Pass, Stripe
   Connect, purchase verification, reconciliation, and webhook functions.
3. Ensure `PAYMENTS_ENABLE_SANDBOX` is unset or not equal to `true` in the
   production edge-function secrets.
4. Confirm Stripe's production webhook destination includes `?env=live`.
5. Deploy the web bundle.
6. Run one controlled low-value live Store purchase and full refund. Verify:
   wallet credit once, one immutable receipt, refund reversal once, and Stripe
   event completion state.
7. Run one controlled Royal Pass live subscription lifecycle: purchase,
   entitlement grant, cancellation-at-period-end, and webhook reconciliation.

## Remaining operational gates before inviting 1,000 users

- Confirm database point-in-time recovery/backups and perform a documented
  restore drill.
- Configure alerts for webhook failures, retrying Stripe claims, critical
  refund reconciliation, edge-function error rate, database saturation, and
  storage failures.
- Run a representative authenticated load test with test accounts and a written
  concurrency target. Keep paid writes and messaging out of uncontrolled load.
- Staff the moderation/report queue and document incident ownership, escalation,
  account recovery, payment support, and rollback procedures.
- Capture real-browser Web Vitals after deployment. The build still contains
  large vendor chunks (Mapbox about 492 KB gzip and the miscellaneous vendor
  chunk about 963 KB gzip), so slow-device/network performance should be watched
  closely during the controlled rollout.

## Recommended rollout

Deploy to production, complete the two live payment canaries, then invite users
in cohorts (for example 50, 200, 500, 1,000) while watching errors, latency,
moderation volume, upload failures, payment retries, and database capacity.
