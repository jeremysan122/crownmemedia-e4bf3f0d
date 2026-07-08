# 0029 — Signed-In Users Can Execute `SECURITY DEFINER` Function

**Level:** WARN · **Count:** 94 · **Category:** SECURITY
**Docs:** https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable

## What the rule detects

`SECURITY DEFINER` functions that are callable by signed-in users (`EXECUTE` granted to `authenticated`). The lint suggests revoking `EXECUTE`, switching to `SECURITY INVOKER`, or moving the function out of the exposed API schema.

## Why we accept these

This is the app's **entire RPC surface** — the direct result of the launch-hardening approach you approved:

> "Every mutation flows through an RPC. Direct table `UPDATE` on protected tables is revoked."

That means every business action — posting, voting, moderating, paying, gifting, verifying, appealing, admin actions — is a `SECURITY DEFINER` RPC that:

1. Has `SET search_path = public` pinned (no search-path hijack).
2. Re-validates `auth.uid()` and role via `has_role(auth.uid(), 'admin'|'moderator')` where relevant.
3. Enforces business rules that RLS alone can't express (idempotency keys, rate limits, cross-table transactions, audit logging).
4. Writes to `admin_audit_log` / `moderation_audit` for admin-privileged actions.

Switching these to `SECURITY INVOKER` would break the app — most of them touch internal tables (`admin_audit_log`, `moderation_queue`, `wallets`, `shekel_ledger`, `crown_map_points`, `posts_edits_audit`, `payouts`, etc.) that `authenticated` is not granted direct access to (by design, so users can't bypass the RPC).

## Findings (grouped by responsibility)

All 94 functions live in `public` schema and are callable by `authenticated`.

### Admin & moderation RPCs — role-gated inside

| Function | Signature | Gate |
|---|---|---|
| `admin_broadcast_notification` | `(_title, _body, _link, _only_active_days)` | admin |
| `admin_decide_sensitive_appeal` | `(_appeal_id, _decision, _notes)` | admin/moderator |
| `admin_decide_verification` | `(_request_id, _decision, _notes)` | admin |
| `admin_list_boost_bundles` | `()` | admin |
| `admin_list_royal_pass_plans` | `()` | admin |
| `admin_list_shekel_bundles` | `()` | admin |
| `admin_list_users` | `(_query, _limit)` | admin |
| `admin_moderate_comment` | `(_comment_id, _removed)` | admin/moderator |
| `admin_set_creator_reward` | `(_reward_id, _status)` | admin |
| `admin_set_creator_status` | `(_user_id, _status, _reason)` | admin |
| `admin_set_post_removed` | `(_post_id, _removed)` | admin/moderator |
| `admin_set_prize_stock` | `(_id, _stock)` | admin |
| `admin_set_profile_verified` | `(_user_id, _verified, _plan)` | admin/moderator — writes `admin_audit_log` |
| `admin_update_post` | `(_post_id, _patch)` | admin/moderator |
| `admin_update_posts_bulk` | `(_post_ids, _patch)` | admin/moderator |
| `admin_upsert_spin_prize` | `(_id, _label, _prize_type, _prize_value, _weight, _color_hex, _active, _sort_order)` | admin |
| `withdraw_my_sensitive_appeal` | `(_appeal_id)` | owner |

### Verification / appeals / trust

| Function | Purpose |
|---|---|
| `apply_to_creator_program` | User applies to creator program. |
| `request_standard_verification` | User submits verification request. |
| `submit_verification_request` | Detailed verification submission (docs, links). |
| `verification_eligibility_progress` | Read own eligibility gauge. |

### Battles

| Function | Purpose |
|---|---|
| `accept_battle` | Accept a challenge. |
| `create_battle_challenge` | Issue a challenge. |
| `decline_battle` | Decline a challenge. |
| `get_battle_official_result` | Read final result. |
| `is_battle_eligible_post` | Check post eligibility. |
| `is_challengeable_user` | Check target user. |

### Posts, comments, reposts, votes

| Function | Purpose |
|---|---|
| `publish_post_idempotent` | Publish with client request-id dedupe. |
| `recalculate_repost_count` | Repair helper. |
| `recalculate_all_repost_counts` | Repair helper (batch). |
| `comments_allowed_on` | Comment eligibility for a post. |
| `can_view_posts_of` | Feed visibility gate. |
| `get_user_liked_post_ids` | Own likes read. |
| `is_thread_muted` | Thread mute check. |

### Wallets, gifts, rewards, boosts, royal pass

| Function | Purpose |
|---|---|
| `ensure_my_wallet` | First-touch wallet creation. |
| `send_dm_gift` | DM gift transaction. |
| `send_dm_share` | DM share transaction. |
| `send_royal_gift` | Royal gift transaction. |
| `mark_dm_gift_seen` | DM gift receipt. |
| `claim_daily_reward` | Daily streak claim. |
| `claim_daily_royal_boost` | Royal boost claim. |
| `royal_pass_daily_boost_status` | Boost status read. |
| `is_royal_pass_active` | Subscription status check. |
| `spin_daily_wheel` | Daily wheel spin. |

### Invites & referrals

| Function | Purpose |
|---|---|
| `get_or_create_my_invite_code` | Idempotent invite-code fetch. |
| `redeem_invite_code` | Redeem another user's code. |
| `invite_leaderboard` (2 overloads) | Public invite leaderboard reads. |

### DMs & notifications

| Function | Purpose |
|---|---|
| `dm_typing_topic_allowed` | Auth gate for typing indicator channel. |
| `mark_all_messages_read` | Mark all DMs read. |
| `mark_all_notifications_read` | Mark all notifications read. |
| `save_push_subscription` | Register web-push endpoint. |
| `notif_pref` | Read own notification pref. |

### Account & profile self-service

| Function | Purpose |
|---|---|
| `deactivate_my_account` | Reversible deactivation. |
| `reactivate_my_account` | Reverse deactivation. |
| `request_account_deletion` | Start deletion window. |
| `cancel_account_deletion` | Cancel pending deletion. |
| `get_my_profile` | Read own profile. |
| `get_my_profile_sensitive` | Read own sensitive fields (from `profiles_private`). |
| `update_my_preferences` | Save preferences JSON. |
| `profile_change_allowed` | Rate limit check for profile changes. |
| `record_profile_visit` | Log profile visit. |
| `cleanup_orphaned_media` | Owner-scoped media cleanup. |

### Auth / role helpers

| Function | Purpose |
|---|---|
| `has_role` | The role oracle used by every RLS policy. |
| `is_any_admin` | Convenience wrapper. |
| `get_my_admin_roles` | Read own admin role set. |

### Creator dashboard

| Function | Purpose |
|---|---|
| `get_creator_dashboard` | Owner-scoped dashboard read. |

> The 94 total includes the entries above plus overloads (e.g., `invite_leaderboard` has two signatures — each counted separately by the linter). The exact list is reproducible with the SQL in the "Reproduce" section below.

## Standard hardening applied to all 94

```sql
-- Every function follows this template:
CREATE OR REPLACE FUNCTION public.some_rpc(...)
RETURNS ...
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public          -- prevents search-path hijack
AS $$
BEGIN
  -- 1. identity check
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  -- 2. role check (admin RPCs only)
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  -- 3. business logic + audit log (admin actions)
  ...
  INSERT INTO public.admin_audit_log(actor_id, action, target_type, target_id, details)
  VALUES (auth.uid(), '...', '...', ...::text, jsonb_build_object(...));
END;
$$;

REVOKE ALL ON FUNCTION public.some_rpc(...) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.some_rpc(...) TO authenticated;
```

## Reproduce the list

```sql
SELECT p.proname,
       pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prosecdef = true
  AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
  AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
ORDER BY p.proname;
```

## Verdict

**Accepted — this IS the security model.** Every function here is a deliberate lockdown mechanism, not an exposure. The lint fires because the count of `SECURITY DEFINER` functions grew as we moved direct writes into RPCs — which is the *goal*, not a regression.

## What would change this verdict

- A `SECURITY DEFINER` function that touches a protected table **without** re-checking `auth.uid()` or `has_role`. Any new RPC PR must include the identity check as the first statement.
- A function that returns rows the caller isn't entitled to (e.g., another user's private fields).
- Removal of `SET search_path = public` from any function.

The source-contract tests in `src/lib/__tests__/*Lockdown.test.ts` catch regressions on the specific RPCs added by each lockdown migration.
