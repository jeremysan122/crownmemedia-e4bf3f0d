# CrownMe Launch Readiness Audit — 2026-07-17

## Decision

**No-go for an unrestricted public launch with payments enabled.** The audited release is materially safer than the starting build, and the exercised application, database, Stripe sandbox lifecycle, and web-push paths now pass their controlled checks. One P0 platform blocker remains: Stripe's native webhook requests are rejected by the Lovable-managed Supabase gateway before CrownMe's HMAC verifier runs. A limited launch is reasonable only if payment-dependent fulfillment is disabled or the gateway/proxy issue is fixed and retested first.

The browser media publication gate is complete. A labeled QA photo and a 1080×1920, 2.9-second Scroll were published, verified, and deleted; a 640×480 landscape clip was correctly rejected from the Scroll path with a 9:16 validation error. The test exposed one additional deletion defect: deleting a post removed its row immediately but left public media to the daily orphan job. All three user-facing delete paths now remove strictly owner-scoped Storage objects immediately, with the scheduled job retained as fallback. Software should not be described as “unbreakable”; the evidence and remaining gaps below define the current boundary.

## Released revisions

- `9bf9c1d` — reverse Shekels when a Stripe store purchase is refunded.
- `7b022d4` — make refund reversal retryable and allow one purchase plus one refund ledger entry per Stripe session.
- `e286df9` — make browser-push state durable and truthful across browser and server state.
- `6126569` — merge the audited release line and remove Lovable's duplicate refund migration.
- GitHub `main` and `agent/production-startup-hotfix` point to the audited release line.
- The production Settings bundle was inspected and contains the authenticated VAPID-key request, `save_push_subscription`, and server read-back verification added by `e286df9`.

## Controlled production and sandbox actions completed

- Loaded authenticated production feed, settings, profile, navigation, messages, notifications, store, and payment entry points on `crownmemedia.com`.
- Sent a clearly labeled QA direct message to `@crownme` and verified it appeared.
- Cast and removed a Crown vote, verifying both state transitions and restoring the original state.
- Changed the theme and restored dark mode.
- Sent the 23-template transactional-email suite twice and verified the `[TEST]` messages arrived in the connected Gmail inbox.
- Completed a real Stripe **sandbox** Starter Pouch purchase for **$2.49**. Wallet fulfillment increased by the expected 500 Shekels.
- Refunded that sandbox purchase and discovered that the original implementation did not reverse the 500 Shekels. The refund RPC, ledger uniqueness rule, and webhook retry behavior were fixed and deployed.
- Replayed the authentic signed `charge.refunded` event. The final state contained exactly one `bundle_refund` entry for -500, exactly one `stripe_store_reversals` entry, and the wallet returned from 172,750 to 172,250.
- Replayed the same event ID and a distinct idempotency probe. Both produced no second debit, ledger entry, or reversal.
- Updated the Stripe sandbox webhook subscription from 5 to 10 events while preserving the original events and adding the five refund/dispute events required by CrownMe.
- Disabled and re-enabled browser push on `@crownmemedia` using the repaired production Settings flow. The backend then verified `push_enabled=true` and exactly one active subscription.
- Ran one labeled production push canary to `@crownmemedia`: the send function returned `sent=1`, `failed=0`, `pruned=0`; the temporary notification was deleted; and the preference/subscription remained unchanged. Server acceptance is verified, but an OS-level visual toast was not observable from the database runner.
- Published a labeled 1080×1080 QA photo through the production file chooser, verified its alt text, caption, category, feed card, and profile tile, then deleted it and confirmed the profile returned to its original post count.
- Verified that the Scroll composer rejects a 640×480 landscape video, then published a public-domain 1080×1920, 2.9-second WebM. The Scroll rendered in the immersive viewer, appeared under `@crownmemedia → Scrolls`, and opened with the correct caption/category metadata before deletion. The temporary Scroll and photo are no longer present in the UI.

## Security remediation

| Finding | Resolution | Verification |
| --- | --- | --- |
| Private profile/settings fields readable through broad profile access | Revoked broad table reads, granted an explicit public-column allowlist, added active-profile RLS, and preserved owner access through `get_my_profile()` | Production SQL verification and anonymous probe |
| Pending battle negotiations publicly readable/streamed | Limited anonymous reads to active/completed battles; pending states are participant/admin/moderator only | Production SQL verification |
| `live_battle_reports` exposed through Realtime | Removed the table from the Realtime publication and replaced client subscriptions with polling/manual refresh | Production publication verification |
| Gift checkout accepted a client redirect destination | Removed the client field and built the return target from a server-owned allowlisted `/royal-pass` destination | Live malicious-URL probe ignored the injected URL |
| Royal Pass communications cron callable without authorization | Enabled JWT verification and added a constant-time service-role bearer check before `run()` | Live non-service-role probe returned 401 |
| Mutable database-function search path | Pinned `collection_completion_title_slug(text)` to `pg_catalog, public` | Production `proconfig` verification |
| Duplicate follow notifications | Removed notification insertion from the counter trigger and kept the single notification path | Live follow canary produced exactly one notification; cleanup restored the original counts |
| Refund did not reverse store Shekels | Added a transactional refund RPC and explicit purchase/refund ledger semantics | Authentic signed sandbox refund plus replay/idempotency checks |
| Web-push UI could report enabled without server state | Reconciled browser subscription, server subscription, and preference; both Settings controls now use one durable operation | Production disable/enable flow plus one-account delivery canary |
| Deleted posts left public media until the daily orphan job | Added owner-scoped media-manifest capture and immediate Storage removal to Feed, Profile, and Archived Posts deletion; deferred cleanup is surfaced and remains covered by the scheduled fallback | 4 focused regression tests, TypeScript, full unit suite, and production build |

Two Lovable warnings were reviewed as intentional fail-closed behavior, not vulnerabilities: feature flags are admin-managed and are not read by normal app clients; direct inserts into `profile_visits` are blocked because visits are recorded through the rate-limited `record_profile_visit` RPC.

## Automated verification

- Vitest: **131 files passed, 5 skipped; 1,085 tests passed, 48 skipped**.
- TypeScript: `tsc --noEmit` passed.
- ESLint: **0 errors, 166 warnings**. The warnings are existing hook-dependency/Fast Refresh cleanup debt and do not fail the configured gate.
- Production Vite build: passed. Vite still reports large-chunk optimization warnings.
- Focused refund and push-persistence regression suites: **13/13 passed**.
- Production anonymous RLS probe: all 15 sensitive tables blocked or returned zero rows; `unsafe: false`.
- Controlled privileged RLS/security probes passed against the authorized production test account.
- Lovable dependency scan: 0 known package vulnerabilities reported.

## P0 launch blocker

Stripe sends webhooks without a Supabase bearer token. Direct unauthenticated requests to both `payments-webhook` and the similarly configured `revenuecat-webhook` receive:

```text
401 UNAUTHORIZED_NO_AUTH_HEADER
```

This occurs at the Lovable-managed Supabase functions gateway even though `supabase/config.toml` declares `verify_jwt = false`, so the request never reaches CrownMe's Stripe-signature verifier. The sandbox refund handler itself is verified when the gateway is passed with an anon bearer token plus an authentic Stripe HMAC, but Stripe cannot supply that bearer token.

Before public payments are enabled, either:

1. Have Lovable/Supabase disable gateway JWT enforcement for the webhook function and then repeat a Stripe-initiated purchase/refund/replay; or
2. Deploy a public ingress proxy that verifies Stripe signatures and forwards to the private handler, then test retry, replay, dispute, and failure recovery end to end.

Do not treat manual authenticated redelivery as proof that native Stripe delivery works.

## Remaining controlled gates

1. After the immediate media-deletion bundle reaches production, publish/delete one labeled canary and confirm its captured public Storage URL returns 404 immediately.
2. Confirm the push canary's OS/browser notification appears and opens the expected route. The server accepted one delivery, but visual receipt was outside the server runner's observability.
3. Run an expired-subscription `410 Gone` cleanup check only with a deterministic first-party test endpoint. It was intentionally skipped because no safe endpoint existed.
4. After the P0 webhook ingress fix, repeat Stripe-initiated purchase, refund, duplicate-event replay, dispute lifecycle, receipt, and failure retry without adding a Supabase authorization header.
5. Monitor error rate, latency, webhook failures, email suppression, storage growth, queue depth, and database saturation during a limited rollout before expanding traffic.

## Non-blocking follow-up

- Split the largest Vite production bundles to improve first-load performance on slower mobile devices.
- Reduce the 166 lint warnings, prioritizing React hook dependency warnings on feed, post, and battle flows.
- Keep recurring RLS probes, dependency scans, browser canaries, database backups, webhook alerts, and restore drills in the release process.
