# Data retention and deletion operations

Last reviewed: 2026-07-17

## User workflow

An authenticated deletion request creates an `account_deletion_jobs` row with a
30-day grace period. Reactivation during that period cancels the queued job. A
service-only worker claims due jobs, removes Storage objects through the Storage
API, prepares/anonymizes relational data, and soft-deletes the Auth user.

Legal or fraud staff may place a documented hold in `account_deletion_holds`.
Holds must contain a reason and expiry where legally possible; they must not be
used merely to retain inactive users.

## What is deleted or anonymized

- Authentication identity and active profile data
- User media and private profile/verification objects returned by the deletion
  storage manifest
- User-generated rows whose foreign keys declare cascade deletion
- Identifying fields on the retained profile tombstone

Financial ledgers, payment transactions, audit/security evidence, disputes, and
records subject to a legal hold may be retained in minimized or pseudonymized
form for applicable legal and accounting periods. Retention is not permission to
retain unnecessary media, tokens, device identifiers, or profile text.

## Operator checks

Review daily:

```sql
select status, count(*), min(execute_after), max(attempts)
from public.account_deletion_jobs
group by status;
```

Any job with repeated failures, a due job older than one hour, or a processing
job older than 30 minutes requires investigation. Do not mark a job complete
until the storage manifest is empty and Auth deletion succeeds.

## Retention schedule

Before launch, legal counsel and the data owner must approve exact periods for:

- financial/payment records;
- security and admin audit logs;
- moderation evidence and appeals;
- support tickets and communication preferences;
- backups and disaster-recovery copies.

Backup expiry must eventually remove deleted personal data. Document any delayed
deletion from immutable backups in the public privacy notice and prevent restored
backups from silently reactivating deleted identities.

## Data export

The current client export covers profile/private-profile, posts, relationships,
preferences, legal acceptances, payments/payouts, verification, reports/appeals,
Royal Pass, notifications, and accessible Storage files. Large or legally
sensitive accounts should use a server-generated, expiring export rather than
relying on a browser tab. Export failures must not be treated as deletion.
