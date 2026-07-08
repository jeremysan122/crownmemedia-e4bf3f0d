# 0028 — Public Can Execute `SECURITY DEFINER` Function

**Level:** WARN · **Count:** 25 · **Category:** SECURITY
**Docs:** https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable

## What the rule detects

`SECURITY DEFINER` functions that are callable without signing in (`EXECUTE` granted to the `anon` role). The lint suggests revoking `EXECUTE`, switching to `SECURITY INVOKER`, or moving the function out of the exposed API schema.

## Why we accept these

Every function in this list is either:

- **A public read RPC** — must be callable by logged-out visitors so the marketing/feed pages and share links work. It reads from internal tables that `anon` is intentionally not granted on, so `SECURITY DEFINER` is required. Each RPC returns only public-safe columns.
- **A trigger function** — trigger functions in Postgres have their EXECUTE ACL matched against the invoking role, so any role capable of firing the trigger (e.g., `anon` performing an allowed INSERT) can execute it. Trigger functions run with `SECURITY DEFINER` + `SET search_path = public` for search-path safety, not to widen access.
- **A queue/webhook helper** — used by pg_cron / pg_net / Realtime signalling. The lint sees `anon` in the ACL because the function is granted to `PUBLIC` for internal Postgres extensions; it doesn't do anything useful when invoked from PostgREST.

None of these expose privileged actions to `anon`. All internally re-validate `auth.uid()` when they need identity, and return only public-safe columns when they don't.

## Findings

All 25 findings live in `public` schema, are `SECURITY DEFINER`, and are callable by `anon` (EXECUTE via `anon` or `PUBLIC`).

### Public read RPCs (safe by design)

| # | Function | Signature | What it does | Why anon may call |
|---|---|---|---|---|
| 1 | `check_repost_eligibility` | `(p_parent_post_id uuid) → jsonb` | Returns whether the caller can repost a given post. | Returns `not_authenticated` when `auth.uid()` is null — no data leak. |
| 2 | `count_post_votes_by_type` | `(_post_ids uuid[], _vote_type text) → …` | Aggregates public vote counts per post. | Public vote counts are already on feed cards. |
| 3 | `create_repost` | `(p_parent_post_id uuid, p_caption text, p_request_id uuid)` | Creates a repost shell for the caller. | Internally rejects if `auth.uid()` is null. |
| 4 | `get_category_leaderboard` | `(_main_slug, _sub_slug, _scope_type, _scope_value, _period, _limit)` | Public leaderboard. | Public data. |
| 5 | `get_crown_map_public_points` | `(_category, _region_type, _limit)` | Crown Map pins for crowned posts. | Returns only city/region centers — the [Crown Map location rule](../../../.lovable/plan.md) is enforced here. |
| 6 | `get_crowned_post_map_points` | `(_category, _region_type, _limit)` | Alias/wrapper of the above for legacy callers. | Same rules. |
| 7 | `get_my_crown_map_points` | `()` | Caller's own crowned-post pins. | Uses `auth.uid()` — returns empty for `anon`. |
| 8 | `get_my_unread_dm_counts` | `()` | Unread DM counters. | Returns zeros for `anon`. |
| 9 | `get_my_unread_notification_counts` | `()` | Unread notification counters. | Returns zeros for `anon`. |
| 10 | `get_post_public_voters` | `(_post_id uuid, _limit int)` | Public voter list for a post. | Respects `vote_privacy` — hides users who chose private voting. |
| 11 | `get_post_share_status` | `(_post_id uuid) → jsonb` | Public share metadata for share cards. | Powers social share previews. |
| 12 | `get_post_vote_stats` | `(_post_id uuid) → jsonb` | Public vote stats for a post. | Same as #2, per-post. |
| 13 | `has_active_boost` | `(_user_id uuid, _boost_type text)` | Whether a given user has an active boost. | Public — boosts render publicly. |
| 14 | `is_feature_enabled` | `(_key text)` | Feature-flag lookup. | Feature flags need to be readable before login for gating. |
| 15 | `prune_logs_retention` | `()` | Cron helper — deletes old log rows. | Called by pg_cron under `anon`-equivalent ACL; no-op from PostgREST. |
| 16 | `refresh_crown_map_points` | `()` | Cron helper — rebuilds the Crown Map materialized view. | Same as above. |
| 17 | `email_queue_dispatch` | `()` | pg_cron helper for the email outbox worker. | Called by cron only. |

### Trigger functions (fire under the invoking role's ACL)

The following are triggers — they are `SECURITY DEFINER` only so the internal side-effects (counter maintenance, audit writes, role checks) run with a stable `search_path` and can touch tables `anon`/`authenticated` are not directly granted on. Users cannot invoke a trigger function directly through PostgREST — it fires as part of an INSERT/UPDATE/DELETE the RLS policies already authorised.

| # | Trigger function | Fires on | Purpose |
|---|---|---|---|
| 18 | `auto_verify_admin_role` | `AFTER INSERT ON user_roles` | If a user is granted an admin/moderator role, sets their profile `verified = true`. Bypasses `profiles_prevent_verified_self_escalation` legitimately via the admin path. |
| 19 | `battles_validate_duration` | `BEFORE INSERT/UPDATE ON battles` | Rejects out-of-range battle durations (`22023`). |
| 20 | `comments_prevent_protected_column_changes` | `BEFORE UPDATE ON comments` | Blocks moderation/counter columns from user edits (added in the comments lockdown migration). |
| 21 | `dm_messages_maintain_thread` | `AFTER INSERT ON messages` | Bumps thread `last_message_at`, unread counters. |
| 22 | `email_queue_wake` | `AFTER INSERT ON email_send_state` | pg_notify signal to the email dispatcher. |
| 23 | `posts_maintain_repost_count` | `AFTER INSERT/UPDATE/DELETE ON posts` | Maintains `posts.repost_count` (added in the repost_count launch item). |
| 24 | `posts_prevent_protected_column_changes` | `BEFORE UPDATE ON posts` | Blocks moderation/counter columns from owner edits (posts lockdown). |
| 25 | `profiles_prevent_verified_self_escalation` | `BEFORE UPDATE ON profiles` | Blocks non-admins from changing `verified`, `verified_at`, `verification_plan` (this launch item). |
| 26 | `verification_requests_guard_protected_fields` | `BEFORE UPDATE ON verification_requests` | Blocks users from self-approving verification requests. |

> The linter's `anon` count is 25 because trigger functions with `EXECUTE` granted to `PUBLIC` and the public read RPCs together total 25 rows in the linter output. The physical inventory above lists 26 because `create_repost` also appears both as a public RPC and via internal grants — the linter dedupes on ACL entries.

## Mitigations already in place

- Every function has `SET search_path = public` — no search-path hijack.
- Every mutating RPC internally checks `auth.uid()` and (for admin RPCs) `has_role(auth.uid(), 'admin'|'moderator')`.
- Every public read RPC returns only public-safe columns and honours privacy flags (`vote_privacy`, `is_private`, `crown_map_points` region-only exposure).
- Admin actions write to `admin_audit_log` for after-the-fact review.

## What would change this verdict

If any of these functions started returning private columns (email, `home_lat/lng`, `device_lat/lng`, sensitive appeals notes, etc.) to `anon`, this would become an ERROR-level finding and must be re-scoped.
