# 0024 — RLS Policy Always True

**Level:** WARN · **Count:** 1 · **Category:** SECURITY
**Docs:** https://supabase.com/docs/guides/database/database-linter?lint=0024_permissive_rls_policy

## What the rule detects

RLS policies that use overly permissive expressions like `USING (true)` or `WITH CHECK (true)` for `UPDATE`, `DELETE`, or `INSERT`. `SELECT` policies with `USING (true)` are intentionally excluded because that pattern is often used deliberately for public read access.

## The finding

Triggered by ONE policy: `Profiles: deny self-mutation of protected fields` on `public.profiles` (`FOR UPDATE`), which uses `USING (true)`.

```sql
CREATE POLICY "Profiles: deny self-mutation of protected fields"
ON public.profiles
FOR UPDATE
TO public
USING (true)                          -- <-- the flagged expression
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'moderator'::app_role)
  OR (
    -- counters (must be unchanged)
    is_suspended       = (SELECT p.is_suspended       FROM public.profiles p WHERE p.id = profiles.id)
    AND crowns_held    = (SELECT p.crowns_held        FROM public.profiles p WHERE p.id = profiles.id)
    AND crowns_total   = (SELECT p.crowns_total       FROM public.profiles p WHERE p.id = profiles.id)
    AND battle_wins    = (SELECT p.battle_wins        FROM public.profiles p WHERE p.id = profiles.id)
    AND followers_count= (SELECT p.followers_count    FROM public.profiles p WHERE p.id = profiles.id)
    AND following_count= (SELECT p.following_count    FROM public.profiles p WHERE p.id = profiles.id)
    AND votes_received = (SELECT p.votes_received     FROM public.profiles p WHERE p.id = profiles.id)
    AND votes_given    = (SELECT p.votes_given        FROM public.profiles p WHERE p.id = profiles.id)
    -- moderation state (must be unchanged)
    AND NOT (is_banned              IS DISTINCT FROM (SELECT p.is_banned              FROM public.profiles p WHERE p.id = profiles.id))
    AND NOT (banned_at              IS DISTINCT FROM (SELECT p.banned_at              FROM public.profiles p WHERE p.id = profiles.id))
    AND NOT (banned_by              IS DISTINCT FROM (SELECT p.banned_by              FROM public.profiles p WHERE p.id = profiles.id))
    AND NOT (banned_reason          IS DISTINCT FROM (SELECT p.banned_reason          FROM public.profiles p WHERE p.id = profiles.id))
    AND NOT (deactivated_at         IS DISTINCT FROM (SELECT p.deactivated_at         FROM public.profiles p WHERE p.id = profiles.id))
    AND NOT (deletion_requested_at  IS DISTINCT FROM (SELECT p.deletion_requested_at  FROM public.profiles p WHERE p.id = profiles.id))
    -- verified badge (must be unchanged)  ← added by profiles_verified_badge_self_escalation lockdown
    AND NOT (verified               IS DISTINCT FROM (SELECT p.verified               FROM public.profiles p WHERE p.id = profiles.id))
    AND NOT (verified_at            IS DISTINCT FROM (SELECT p.verified_at            FROM public.profiles p WHERE p.id = profiles.id))
    AND NOT (verification_plan      IS DISTINCT FROM (SELECT p.verification_plan      FROM public.profiles p WHERE p.id = profiles.id))
  )
);
```

## Why we accept it

`profiles` has TWO `UPDATE` policies. Postgres RLS requires **all matching permissive policies to pass**, so both must be satisfied:

1. **`Users can update their own profile`** — `USING (auth.uid() = id)` — scopes which **rows** the caller may touch (their own row only).
2. **`Profiles: deny self-mutation of protected fields`** — `USING (true)` — scopes which **columns** the caller may change (owner-safe columns only).

Row scoping is entirely handled by policy #1. Policy #2 exists to enforce column-lockdown via `WITH CHECK` on every UPDATE that reaches this table. Setting `USING` on policy #2 to `auth.uid() = id` would:

- Duplicate the ownership check already in policy #1.
- Silently exempt admin/moderator writes from the column-lockdown branch, because they don't own the row.

Defense-in-depth is layered on with a `BEFORE UPDATE` trigger `profiles_prevent_verified_self_escalation` that also blocks verified-badge changes for non-privileged callers, so even if this policy were somehow bypassed, the trigger still raises `42501`.

## Related migrations

- `supabase/migrations/20260708200737_*.sql` — `verification_requests` + `sensitive_appeals` lockdown
- `supabase/migrations/20260708201622_*.sql`, `20260708202035_*.sql` — posts/comments column lockdown
- Latest migration — added `verified`, `verified_at`, `verification_plan` to this policy's WITH CHECK and installed the verified-escalation guard trigger.

## Related source contract tests

- `src/lib/__tests__/profileVerifiedLockdown.test.ts` — 10 assertions covering the policy extension, the trigger, and the admin RPC.

## Verdict

**Accepted — intentional pairing.** Not a real vulnerability. Do NOT "fix" this by tightening `USING` to `auth.uid() = id` — it would weaken the admin/moderator branch of the WITH CHECK.
