# CrownMe controlled web-launch runbook

This runbook is for the first 50, 200, 500, and 1,000 registered users. It
does not replace a named on-call roster. Before the first invitation, the
account owner must assign one launch commander and one backup who can access
Lovable Cloud, Stripe, GitHub Actions, and `/admin/command-center`.

## Before every cohort

1. Confirm the latest `main` CI run is green and production matches that SHA.
2. Open `/admin/command-center` and clear or investigate every unacknowledged
   critical alert. Never acknowledge an alert only to make the count zero.
3. Confirm `royal_pass_debits_paused = false`. Keep
   `royal_pass_public_launch = false` until the live subscription canary passes.
4. Confirm `royal-pass-reconcile-hourly`, `royal-pass-comms-cron-daily`,
   `capture-db-health-snapshot`, `evaluate-launch-ops-5m`, and
   `finalize-expired-battles-1m` are active and their latest runs succeeded.
5. Confirm there are no unprocessed Stripe events, stale event claims, or Store
   reversals requiring reconciliation.
6. Record current active/max database connections, disk usage, upload failures,
   client error count, and route-smoke latency as the cohort baseline.

## Stop-the-line thresholds

Pause new invitations immediately when any of these is true:

- payment webhook or refund processing has an unresolved critical alert;
- any Store purchase credits twice or a refund reverses twice;
- Royal Pass entitlement differs from Stripe after reconciliation;
- active database connections reach 75% for two consecutive samples or 90%
  once;
- a deadlock, data-leak signal, cross-account authorization failure, or
  unexplained wallet drift appears;
- route error rate exceeds 2% for five minutes or uploads fail above 5% for ten
  minutes;
- the moderation queue has no active owner or exceeds the response capacity of
  the assigned team.

## Emergency controls

- Royal Pass sales: set `royal_pass_public_launch = false`.
- Economy spending: set `royal_pass_debits_paused = true`.
- Live battles: set `live_battles_enabled = false`.
- Bad web release: revert the merge commit in GitHub, wait for green CI, then
  publish that exact `main` SHA in Lovable.
- Bad database migration: do not hand-edit production rows. Stop writes for the
  affected feature, export evidence, and apply a forward-only corrective
  migration. Use the latest database export only as disaster-recovery input.

## Payments support

For every complaint, capture the CrownMe user ID, Stripe Checkout Session ID,
Stripe event ID, amount, timestamp, and the matching immutable ledger/receipt
rows. Refund from Stripe only after matching the session to the CrownMe user.
Keep the Store or Royal Pass feature paused until any reconciliation alert is
resolved and a controlled replay proves idempotency.

## Account recovery and abuse

- Never change email, verification, wallet, role, suspension, or entitlement
  fields directly from the browser client.
- Use documented admin RPCs and retain the generated audit-log row.
- Escalate payment fraud, account takeover, child-safety, credible threat, and
  legal requests to the launch commander immediately; preserve evidence and do
  not disclose private reporter or moderation data.
- Review the report queue at least at the start and end of each coverage shift.

## Cohort advancement

Hold each cohort for at least one full peak-usage window. Advance only when
there are no unresolved critical alerts, no payment or authorization drift,
the moderation queue is within the staffed response target, p95 route latency
is stable, and database/storage headroom remains above the stop thresholds.
