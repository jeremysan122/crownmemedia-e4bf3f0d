# CrownMe launch and incident runbook

Owner: CrownMe Media
Last reviewed: 2026-07-17
Production: `https://crownmemedia.com`
Supabase project: `bailrqskqpmzvsgivhvm`

## Release gate

Do not launch or promote a release until all of the following are true:

- GitHub CI, CodeQL, and production-smoke checks pass.
- The release was built with the production Supabase URL, publishable key, and
  project ID. The three values must identify the same project.
- All pending Supabase migrations and Edge Functions were deployed first to a
  non-production project and exercised there.
- Stripe sandbox and live webhook signatures were tested. RevenueCat is either
  completely configured and tested or its UI is disabled.
- `CRON_SECRET` is at least 32 random bytes and is present in Supabase secrets and
  every scheduler request.
- Account deletion, moderation queues, payment retries, email, and error alerts
  have named operators for the launch window.
- A database backup exists and a restore rehearsal has passed within 30 days.

## Required production configuration

Frontend build variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_PROJECT_ID=bailrqskqpmzvsgivhvm`
- `VITE_PAYMENTS_CLIENT_TOKEN`
- `VITE_APP_RELEASE` (Git commit SHA or release tag)
- `VITE_ERROR_REPORTING_ENDPOINT` (independent of Supabase)

If the reporting endpoint is not `https://errors.crownmemedia.com`, add its
exact HTTPS origin to `connect-src` in `public/_headers` and verify a forced
bootstrap error reaches it before launch.

Server secrets include the Supabase service key, Stripe sandbox/live keys and
webhook secrets, RevenueCat webhook authorization value, and `CRON_SECRET`.
Never copy server secrets into a `VITE_` variable, repository file, issue, or log.

## Deployment

1. Create a release branch and require review for auth, payments, moderation,
   storage, and migrations.
2. Apply migrations to staging; deploy functions; run payment, deletion, upload,
   and moderation acceptance tests.
3. Run `npm run verify` with production-shaped public variables.
4. Deploy database migrations and functions to production.
5. Deploy the frontend with `VITE_APP_RELEASE` set to the exact commit.
6. Confirm the scheduled production smoke succeeds and manually check sign-in,
   feed, upload, checkout sandbox, legal pages, and account settings.
7. Observe client-error volume, Edge Function errors, webhook retries, database
   load, moderation backlog, and deletion failures for at least 30 minutes.

## Scheduler setup

Schedule these as authenticated `POST` requests using
`Authorization: Bearer <CRON_SECRET>`:

- `process-account-deletions`: every 15 minutes
- `process-media-analysis-queue`: every minute
- `royal-pass-reconcile`: every 15 minutes
- `royal-pass-comms-cron`: hourly

Never put the service-role key in a third-party scheduler. Rotate `CRON_SECRET`
after operator departure, scheduler compromise, or accidental disclosure.

## Rollback

1. Stop the frontend rollout or redeploy the prior known-good commit.
2. Disable the affected feature flag or payment surface.
3. Do not roll back a destructive database migration blindly. Prefer a forward
   repair migration; restore only under the recovery procedure below.
4. For payment failures, leave Stripe/RevenueCat retries enabled and preserve
   provider event IDs. Never manually credit a wallet without an audit record.
5. Record timeline, scope, decision maker, and follow-up owner.

## Incident severity

- SEV-0: active account takeover, exposed secret, unauthorized money movement,
  widespread private-data exposure. Disable the affected path immediately,
  revoke credentials, preserve logs, and notify legal/security leadership.
- SEV-1: production unavailable, uploads universally failing, payments charged
  without fulfillment, deletion pipeline stuck, or moderation publishing unsafe
  media. Mitigate immediately and post regular status updates.
- SEV-2: degraded feature with a safe workaround and no integrity/privacy loss.
- SEV-3: cosmetic or low-impact issue suitable for the normal backlog.

For every SEV-0/1, create an incident record, capture UTC timestamps and release
SHA, avoid sensitive data in chat, and complete a blameless review within five
business days.

## Recovery objectives and backups

Launch targets are RPO 24 hours and RTO 8 hours until automated point-in-time
recovery is contractually verified. Confirm Supabase backup/PITR settings in the
provider console; repository code cannot prove they are enabled.

Quarterly restore rehearsal:

1. Restore the latest backup into an isolated project.
2. Verify row counts and referential integrity for profiles, posts, ledgers,
   payment transactions, subscriptions, moderation, and deletion jobs.
3. Verify private storage objects independently; database backups do not prove
   Storage recovery.
4. Exercise sign-in, feed, upload, export, and an idempotent payment replay.
5. Record actual RPO/RTO, failures, and remediation owner.

## Launch dashboards and alerts

Alert on bootstrap configuration failures, client error-rate changes, HTTP 5xx,
Stripe and RevenueCat retries, unknown paid price IDs, moderation backlog age,
account-deletion retry count, storage errors, database saturation, and production
smoke failure. Alerts must reach a human outside Supabase so a Supabase outage is
still visible.
