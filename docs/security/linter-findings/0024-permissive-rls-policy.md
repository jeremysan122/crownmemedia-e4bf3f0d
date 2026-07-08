# 0024 — RLS Policy Always True

**Level:** WARN · **Count:** 1 · **Category:** SECURITY
**Docs:** https://supabase.com/docs/guides/database/database-linter?lint=0024_permissive_rls_policy

## What the rule detects

RLS policies whose `USING`/`WITH CHECK` expression is `true` (or otherwise unconditional) for `UPDATE`, `DELETE`, or `INSERT`. `SELECT` policies with `USING (true)` are excluded because that pattern is often intentional for public reads.

## The finding

Triggered by ONE policy: `Profiles: deny self-mutation of protected fields` on `public.profiles` (`FOR UPDATE`), which uses `USING (true)`.

```sql
CREATE POLICY "Profiles: deny self-mutation of protected fields"
ON public.profiles
AS RESTRICTIVE          -- <-- critical: this policy is RESTRICTIVE, not permissive
FOR UPDATE
TO authenticated
USING (true)            -- <-- the flagged expression
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'moderator'::public.app_role)
  OR (
    -- protected counters, moderation state, and verified-badge fields must all stay unchanged
    is_suspended           IS NOT DISTINCT FROM (SELECT p.is_suspended           FROM public.profiles p WHERE p.id = profiles.id)
    AND crowns_held        IS NOT DISTINCT FROM (SELECT p.crowns_held            FROM public.profiles p WHERE p.id = profiles.id)
    -- …the full column list is in the migration…
    AND verified           IS NOT DISTINCT FROM (SELECT p.verified               FROM public.profiles p WHERE p.id = profiles.id)
    AND verified_at        IS NOT DISTINCT FROM (SELECT p.verified_at            FROM public.profiles p WHERE p.id = profiles.id)
    AND verification_plan  IS NOT DISTINCT FROM (SELECT p.verification_plan      FROM public.profiles p WHERE p.id = profiles.id)
  )
);
```

## Why we accept it

Postgres has two RLS policy kinds and they combine very differently:

- **Permissive policies (default)** are combined with **OR**. Any single permissive policy that passes allows the row. A permissive `USING (true)` on `UPDATE` would therefore *broaden* access — and that would be a real vulnerability.
- **Restrictive policies (`AS RESTRICTIVE`)** are combined with **AND**. Every restrictive policy that matches the command must pass. They can only ever *narrow* access.

This policy is declared `AS RESTRICTIVE`, so its purpose is column-lockdown, not row-scoping:

1. **`Users can update their own profile`** — permissive, `USING (auth.uid() = id) WITH CHECK (auth.uid() = id)`. Scopes which **rows** the caller may touch (their own row only).
2. **`Profiles: deny self-mutation of protected fields`** — **restrictive**, `USING (true)` + a column-diff `WITH CHECK`. Scopes which **columns** the caller may change (owner-safe columns only, unless admin/moderator).

`USING (true)` on the restrictive policy is intentional: we want *every* UPDATE that reaches this table (whether or not the row is the caller's own) to pass through the column-lockdown `WITH CHECK`. Restricting `USING` to `auth.uid() = id` would silently exempt admin/moderator updates from the column-lockdown branch because they don't own the row — the opposite of what we want.

Defense-in-depth is layered on with a `BEFORE UPDATE` trigger `profiles_prevent_verified_self_escalation` that also blocks verified-badge changes for non-privileged callers, so even if the policy were somehow bypassed the trigger still raises `42501`.

## Related migrations

- `supabase/migrations/20260708200737_*.sql` — `verification_requests` + `sensitive_appeals` lockdown
- `supabase/migrations/20260708201622_*.sql`, `20260708202035_*.sql` — posts/comments column lockdown
- `supabase/migrations/20260708203409_*.sql` — added `verified`, `verified_at`, `verification_plan` to this policy's WITH CHECK and installed the verified-escalation guard trigger.
- Latest migration — recreated this policy `AS RESTRICTIVE FOR UPDATE TO authenticated` so its column-lockdown is always enforced, and revoked anon EXECUTE from auth-only RPCs and cron helpers.

## Related source contract tests

- `src/lib/__tests__/profileVerifiedLockdown.test.ts` — asserts the trigger, the admin RPC, and the extended WITH CHECK.
- `src/lib/__tests__/profileRestrictiveUpdatePolicy.test.ts` — asserts the policy is `AS RESTRICTIVE`, scoped to `authenticated`, and that no payment/subscription code path writes to `verified` directly.

## Verdict

**Accepted — RESTRICTIVE column-lockdown, intentional pairing.** Not a real vulnerability. Do NOT "fix" this by removing `AS RESTRICTIVE` or by tightening `USING` to `auth.uid() = id`: either change silently weakens the guard.
