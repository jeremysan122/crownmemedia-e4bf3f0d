# CrownMe Launch Readiness Audit — 2026-07-17

## Decision

**Conditional go.** The audited release is materially safer and more reliable than the starting build, and the verified code, database, and production read paths are suitable for a controlled launch. A final staging gate is still required for a complete payment lifecycle, actual browser-push receipt, media publication through a real file chooser, and privileged abuse tests. No report should describe CrownMe as “unbreakable”; those controlled checks and ongoing monitoring remain necessary.

## Released revisions

- `ed747b2` — hardened live launch canary workflows.
- `ac31abb` — remediated launch security findings.
- `d1d70de` — merged the audited release with Lovable's production migration records.
- `5c1d12f` — removed Lovable's duplicate migration copy so a fresh database will not attempt to create the same policies twice.
- GitHub `main` and `agent/production-startup-hotfix` were pushed to the audited release line.

## Production actions completed

- Loaded the authenticated production feed and core navigation on `crownmemedia.com` after release.
- Sent a clearly labeled QA direct message to `@crownme` and verified the message appeared.
- Cast and removed a Crown vote, verifying both state transitions and restoring the original state.
- Changed the theme and restored dark mode.
- Disabled and re-enabled browser-push permission in the CrownMe account, restoring the original enabled state.
- Sent the 23-template transactional-email suite twice and verified the `[TEST]` messages arrived in the connected Gmail inbox.
- Opened the production Stripe checkout entry point and verified that the minimum live offer rendered. No charge was submitted because no exact product, amount, and payment method were authorized for a real transaction.
- Verified the live gift-checkout function ignores an injected external `return_url`.
- Verified the live Royal Pass communications cron returns `401 {"ok":false,"error":"Unauthorized"}` to a valid non-service-role JWT before its scan executes.

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

Two Lovable warnings were reviewed as intentional fail-closed behavior, not vulnerabilities: feature flags are admin-managed and are not read by normal app clients; direct inserts into `profile_visits` are blocked because visits are recorded through the rate-limited `record_profile_visit` RPC.

## Automated verification

- Vitest: 128 files passed, 5 skipped; 1,068 tests passed, 48 skipped.
- TypeScript: `tsc --noEmit` passed.
- ESLint: passed with no errors.
- Production Vite build: passed.
- Launch-remediation regression suite: 5/5 passed after release cleanup.
- Production anonymous RLS probe: all 15 sensitive tables blocked or returned zero rows; `unsafe: false`.
- Security suite: 31 checks passed; 31 privileged checks skipped because isolated privileged test credentials were not supplied.
- Lovable dependency scan: 0 known package vulnerabilities reported.

## Required final staging gate

1. Complete a Stripe test-mode purchase, webhook fulfillment, cancellation/refund, receipt, and duplicate-event replay using a dedicated test customer. Do not use a real card or charge production without an exact user-approved item and amount.
2. Publish and delete a labeled QA photo and video through a real browser file chooser; verify feed, profile, Scrolls, poster, metadata, moderation, and storage cleanup. The automated browser bridge opened the native picker but could not attach the file, so no production post or existing draft was changed.
3. Send a controlled web-push test to a dedicated device and verify delivery, click-through, badge clearing, unsubscribe, and expired-subscription cleanup.
4. Run the skipped privileged security suite in an isolated staging project with service-role and test-user credentials. Exercise rate limits, duplicate payments, webhook replay, vote/follow/message spam, upload abuse, and moderator/admin authorization boundaries.
5. Monitor error rate, latency, queue depth, email suppression, payment-webhook failures, storage growth, and database saturation during a limited rollout before expanding traffic.

## Non-blocking follow-up

- Split the largest production bundles reported by Vite to improve first-load performance on slower mobile devices.
- Keep recurring RLS probes, dependency scans, browser canaries, database backups, and restore drills in the release process.
