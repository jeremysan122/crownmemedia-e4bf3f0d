
-- =============================================================
-- 1. Lock down SECURITY DEFINER function execute permissions
-- =============================================================
-- Default Postgres behaviour grants EXECUTE on new functions to PUBLIC.
-- Every SECURITY DEFINER function in the public schema therefore runs as
-- its owner with no caller restriction, which is what the linter is
-- flagging. We revoke that blanket grant on EVERY public function and
-- then re-grant per role based on the function's actual role.

-- 1a. Revoke from PUBLIC + anon on every function in public.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT n.nspname AS schema_name, p.proname AS func_name,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM PUBLIC',
                   r.schema_name, r.func_name, r.args);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM anon',
                   r.schema_name, r.func_name, r.args);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM authenticated',
                   r.schema_name, r.func_name, r.args);
  END LOOP;
END $$;

-- 1b. Re-grant to authenticated for normal user-facing RPCs.
-- These are all callable by any signed-in user; each function validates
-- ownership / role internally (see has_role, is_any_admin checks).
DO $$
DECLARE
  fn text;
  authenticated_fns text[] := ARRAY[
    -- Identity / role helpers
    'has_role(uuid, app_role)',
    'is_any_admin(uuid)',
    'is_feature_enabled(text)',
    'can_view_posts_of(uuid)',
    'comments_allowed_on(uuid)',
    'dm_typing_topic_allowed(text)',
    'notif_pref(uuid, text)',
    'is_thread_muted(uuid, uuid)',
    'has_active_boost(uuid, text)',
    -- Profile / account
    'get_my_profile()',
    'get_my_profile_sensitive()',
    'profile_change_allowed(text, integer)',
    'cancel_account_deletion()',
    'request_account_deletion()',
    'reactivate_my_account()',
    'deactivate_my_account()',
    'ensure_my_wallet()',
    'mark_all_messages_read()',
    'mark_all_notifications_read()',
    'record_profile_visit(uuid)',
    'save_push_subscription(text, text, text, text)',
    -- Posts
    'publish_post_idempotent(text, jsonb)',
    'cleanup_orphaned_media(integer)',
    -- Public read helpers (used in authenticated flows too)
    'get_post_share_status(uuid)',
    'get_post_vote_stats(uuid)',
    'get_post_public_voters(uuid, integer)',
    'get_user_liked_post_ids(uuid, integer)',
    'count_post_votes_by_type(uuid[], text)',
    'get_category_leaderboard(text, text, ranking_scope, text, ranking_period, integer)',
    'get_battle_official_result(uuid)',
    -- Boosts / royal pass / gifts / rewards
    'claim_daily_reward()',
    'claim_daily_royal_boost(uuid)',
    'royal_pass_daily_boost_status()',
    'spin_daily_wheel()',
    'send_royal_gift(text, uuid, uuid, integer, uuid)',
    -- Invites / creator program
    'get_or_create_my_invite_code()',
    'redeem_invite_code(text)',
    'invite_leaderboard(text, integer)',
    'invite_leaderboard(text, integer, text)',
    'apply_to_creator_program(text)',
    'get_creator_dashboard(uuid)',
    -- Verification
    'submit_verification_request(verification_plan_type, text, text, text, text, jsonb, integer, text, text, text, text)',
    -- Admin RPCs (function validates role internally)
    'admin_broadcast_notification(text, text, text, integer)',
    'admin_decide_verification(uuid, verification_status, text)',
    'admin_list_users(text, integer)',
    'admin_set_creator_reward(uuid, text)',
    'admin_set_creator_status(uuid, text, text)',
    'admin_set_prize_stock(uuid, integer)',
    'admin_upsert_spin_prize(uuid, text, text, integer, integer, text, boolean, integer)',
    'grant_pass_invite_bonus(uuid)',
    'recalc_post_score(uuid)',
    'refresh_crowns_for_post(uuid)',
    'evaluate_creator_milestones(uuid)'
  ];
BEGIN
  FOREACH fn IN ARRAY authenticated_fns LOOP
    BEGIN
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', fn);
    EXCEPTION WHEN undefined_function THEN
      RAISE NOTICE 'skip missing function: %', fn;
    END;
  END LOOP;
END $$;

-- 1c. Re-grant to anon for the small set of helpers used by logged-out
-- share-card pages, public leaderboards, and the public feed widget.
DO $$
DECLARE
  fn text;
  anon_fns text[] := ARRAY[
    'is_feature_enabled(text)',
    'get_post_share_status(uuid)',
    'get_post_vote_stats(uuid)',
    'get_post_public_voters(uuid, integer)',
    'count_post_votes_by_type(uuid[], text)',
    'get_category_leaderboard(text, text, ranking_scope, text, ranking_period, integer)',
    'has_active_boost(uuid, text)'
  ];
BEGIN
  FOREACH fn IN ARRAY anon_fns LOOP
    BEGIN
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO anon', fn);
    EXCEPTION WHEN undefined_function THEN
      RAISE NOTICE 'skip missing function: %', fn;
    END;
  END LOOP;
END $$;

-- 1d. Re-grant to service_role for cron / backend-only helpers.
DO $$
DECLARE
  fn text;
  service_fns text[] := ARRAY[
    'cleanup_orphaned_media_global(integer)',
    'prune_rank_snapshots()',
    'snapshot_category_ranks()',
    'snapshot_post_ranks()',
    'capture_db_health_snapshot()',
    'evaluate_cost_alerts()',
    'compute_daily_usage_rollup(date)',
    'get_db_vitals()',
    'assert_security_invariants()',
    'assumption(text, numeric)',
    'enqueue_email(text, jsonb)',
    'read_email_batch(text, integer, integer)',
    'delete_email(text, bigint)',
    'move_to_dlq(text, text, bigint, jsonb)'
  ];
BEGIN
  FOREACH fn IN ARRAY service_fns LOOP
    BEGIN
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', fn);
    EXCEPTION WHEN undefined_function THEN
      RAISE NOTICE 'skip missing function: %', fn;
    END;
  END LOOP;
END $$;

-- 1e. Trigger-bound functions (trg_*, tg_*, *_notify*, guard_*, bump_*,
-- handle_new_user, create_default_notification_prefs, create_wallet_for_user,
-- log_posts_moderation_changes, posts_write_edit_audit, posts_guard_publish_status,
-- posts_notify_tagged, send_push_on_notification, analytics_events_rate_limit,
-- comments_rate_limit, battles_guard_participant_updates) intentionally have
-- NO direct execute grant — they run from their triggers under the function
-- owner. SECURITY DEFINER is still respected when triggers fire.

-- service_role keeps its implicit ability to call everything via the
-- supabase admin path; no explicit grant needed for that.

-- =============================================================
-- 2. streak_reminders_sent: owner read policy
-- =============================================================
CREATE POLICY "streak reminders owner read"
  ON public.streak_reminders_sent FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());
