# Security Regression Contract

Adjacent to the tests under `src/lib/__tests__/permissionContract.test.ts`,
`src/lib/__tests__/postsGuardTriggerDepthBypass.test.ts`,
`src/lib/__tests__/crownVoteRegressionContract.test.ts`,
`src/pages/__tests__/EditProfileSavePath.test.ts`, and
`src/components/battles/__tests__/BattleInvitationRpcWiring.test.ts`.

## Why these invariants exist

Three mobile screenshot flows broke in July 2026 after well-intentioned
security migrations. Each fix is now guarded by a test — do not weaken any
invariant below without updating the test **and** re-running the signed-in
probe described in each section.

### 1. EditProfile own-row UPDATE

- **What broke:** saving a profile without changing the username failed
  with `null value in column "username" of relation "profiles" violates
  not-null constraint`.
- **Root cause:** the client used PostgREST `upsert`. Upsert always tries
  the INSERT branch first; NOT NULL is checked before `ON CONFLICT` picks
  the UPDATE branch, so any payload missing `username` fails.
- **Contract:** the profile save is a plain `UPDATE ... WHERE id = uid`.
  The payload never contains `date_of_birth` (signup-locked) or `email`
  (routed through `supabase.auth.updateUser` so the confirmation email
  fires).
- **Invariant test:** `EditProfileSavePath.test.ts`.

### 2. Battle invitation — accept / decline / host-cancel

- **What broke:** ad-hoc client mutations of `battles` / `live_battles`
  bypassed status checks and let stale invitations be "accepted" twice or
  cancelled by the wrong actor. On mobile this surfaced as either silent
  success on a dead invitation or a raw PostgREST error toast.
- **Root cause:** direct `.from('battles').update(...)` calls, missing
  `battleErrorMessage` mapping.
- **Contract:**
  - Battles list dialog uses `accept_battle` / `decline_battle` RPCs only.
  - LiveBattle helpers use `live_battle_accept` / `live_battle_decline` /
    `live_battle_cancel` RPCs only.
  - Every failure passes through `battleErrorMessage(kind, err)`.
  - RPC bodies (SECURITY DEFINER, `SET search_path = public`) enforce
    actor scope: opponent-only for accept, either participant for decline,
    host-only for cancel. `live_battle_accept` returns the row unchanged
    when `accepted_at IS NOT NULL` — this is what makes repeated taps
    idempotent.
  - Post-accept the client routes to `/battles/:id/lobby` (delegated to
    `onResolved` in the dialog; the RPC also enqueues the lobby link in
    its `_notify_live_battle` payload).
- **Invariant tests:** `BattleInvitationRpcWiring.test.ts`,
  `permissionContract.test.ts` (`battle invitation RPCs are actor-scoped`).

### 3. Crown / vote nested trigger update

- **What broke:** casting a crown vote raised
  `Not permitted to modify protected post field (42501)` because the
  `votes_recalc` AFTER-INSERT trigger updates `posts.vote_count` /
  `crown_score`, and two BEFORE-UPDATE guards on `posts` refused it.
- **Root cause:** `posts_prevent_protected_column_changes` and
  `posts_guard_protected_fields` did not treat nested trigger depth as
  trusted. The sister guard `posts_guard_owner_updates` already did.
- **Contract:** both guards contain
  `IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;` *after* the
  immutable-column raise (so identity swaps are blocked at every depth)
  and *before* the protected-column raise. Direct user UPDATEs still hit
  the raise at depth 1 and are additionally blocked by the column-level
  UPDATE grant allowlist on `public.posts`.
- **Invariant tests:** `postsGuardTriggerDepthBypass.test.ts`,
  `crownVoteRegressionContract.test.ts`.

### 4. Permission contract — future migrations

- **What broke previously:** the same July migrations revoked `SELECT` on
  `posts` / `profiles` from `authenticated`, which broke every path that
  relied on PostgREST `RETURNING` (upsert, RPC re-reads).
- **Contract:** `permissionContract.test.ts` inspects the **effective
  latest** state of `supabase/migrations/` (not any single file). For every
  critical `(privilege, role, table)` triple it walks the migration corpus
  in filename order and asserts the last matching GRANT beats the last
  matching REVOKE. Similarly, anon whole-table `SELECT` on `profiles` and
  `crown_map_points` must remain absent — the sanctioned anon surface is
  `profiles_public` and `posts_public`.

## What must NOT change without updating this contract

- LiveKit end-of-battle behavior — battles end only on the
  `room_finished` webhook event, never on `participant_left`. Any change
  here needs its own regression test alongside these.
- Stripe partial refund → `handle_store_partial_refund` RPC → wallet
  reversal + `partially_reversed` status. Refund idempotency is anchored
  in the webhook handler; do not add a second entry point without an
  idempotency test.
- `service_role` bypass on the two `posts` guard triggers — webhooks and
  cron jobs depend on it.

## Before you loosen anything

1. Run `bunx vitest run src/lib/__tests__/permissionContract.test.ts`
   and the four adjacent regression files.
2. Re-run the signed-in probe under `/tmp/browser/verify/full_probe.py`
   (profile update, vote insert with count refresh, direct crown_score
   tamper — all three must still PASS / DENIED as appropriate).
3. Only then update this document and the affected test.

## 5. Posts safe-column allowlist (2026-07-23 CRITICAL re-fix)

- **What broke:** the emergency migration `20260723134156` re-granted
  whole-table `SELECT ON public.posts TO authenticated` to unbreak vote /
  battle / profile flows. Combined with the RLS policy
  `posts_public_read_approved` (roles = PUBLIC), any signed-in user could
  read every column of every approved post — including `post_lat` /
  `post_lng` / `location_captured_at`, `submission_key`,
  `client_request_id`, `moderation_notes`, `moderation_status`,
  `moderated_by`, `moderated_at`, `sensitive_reason`, and AI internals.
- **Root cause:** granting a table-wide privilege to satisfy a small set
  of columns needed by owner UIs. Column privileges cannot distinguish
  owners, so once granted every authenticated user gets the column.
- **Contract:**
  - `authenticated` MUST NOT hold whole-table `SELECT` on `public.posts`.
    Only a column-level allowlist is allowed. Enforced by
    `permissionContract.test.ts → posts least-privilege for authenticated`.
  - The column allowlist granted to `anon` and `authenticated` MUST NOT
    include `post_lat`, `post_lng`, `location_captured_at`,
    `submission_key`, `client_request_id`, `moderation_notes`,
    `moderated_by`, `moderated_at`, `sensitive_reason`, or AI moderation
    columns. Enforced by the same test block by parsing the LAST
    column-scoped `GRANT SELECT (…) ON public.posts TO <role>`.
  - Owner reads of a protected column must go through a SECURITY DEFINER
    RPC. Today the client doesn't need any of them — a repo scan of
    `src/**/*.{ts,tsx}` returns zero hits.
  - `REVOKE SELECT ON public.posts FROM <role>` also drops column-level
    grants; any migration that revokes must immediately re-grant the
    intended column list in the same file.
  - Vote / crown recalcs run via `trg_recalc_from_votes → recalc_post_score`
    (SECURITY DEFINER, `SET search_path = public`), which bypasses caller
    column grants — no client column privilege on `vote_count` /
    `crown_score` is needed.

- **Runtime probes (kept under `/tmp/browser/posts_exposure/probe.py`):**
  1. anon raw `post_lat` → 401 permission denied ✅
  2. authenticated non-owner raw `post_lat` / `submission_key` /
     `client_request_id` / `moderation_notes` / `moderated_by` /
     `moderated_at` / `sensitive_reason` / `location_captured_at` → 403 ✅
  3. owner safe read (`id, caption, image_url, crown_score, vote_count`) → 200 ✅
  4. `posts_public` anon 200, authenticated 200 ✅
  5. vote insert + count refresh: covered by prior signed-in probe (the
     SECURITY DEFINER trigger bypass keeps working) ✅
  6. direct crown_score tamper on somebody else's post → 403 ✅
  7. battle re-read (`moderation_status`) → 200 ✅
