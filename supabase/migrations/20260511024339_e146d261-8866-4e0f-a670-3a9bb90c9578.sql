
-- Revoke direct EXECUTE on internal trigger / helper SECURITY DEFINER functions.
-- These are only meant to be invoked by triggers or other server code, never by clients.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
      AND p.proname IN (
        'posts_guard_owner_updates',
        'battles_guard_participant_updates',
        'trg_battle_status_notify',
        'trg_battle_completed',
        'trg_battle_vote',
        'trg_notify_battle_create',
        'trg_notify_comment',
        'trg_notify_comment_reply',
        'trg_notify_mentions',
        'trg_notify_vote',
        'trg_recalc_from_comments',
        'trg_recalc_from_votes',
        'trg_recalc_from_share',
        'trg_refresh_crowns',
        'trg_follow_counts',
        'trg_sync_comment_edit',
        'trg_admin_audit',
        'comments_rate_limit',
        'votes_rate_limit',
        'analytics_events_rate_limit',
        'create_default_notification_prefs',
        'create_wallet_for_user',
        'handle_new_user',
        'refresh_crowns_for_post',
        'recalc_post_score',
        'assert_security_invariants'
      )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %I.%I(%s) FROM PUBLIC, anon, authenticated;',
                   r.nspname, r.proname, r.args);
  END LOOP;
END $$;
