
-- Lock down SECURITY DEFINER functions in public schema.
-- Goal: eliminate 298 linter warnings (0028 anon_security_definer / 0029 authenticated_security_definer)
-- Strategy:
--   1) REVOKE EXECUTE from PUBLIC on every SECURITY DEFINER function (removes default anon/authenticated inheritance)
--   2) Re-GRANT EXECUTE to `authenticated` on user-facing RPCs and admin RPCs (admin RPCs check role internally)
--   3) Re-GRANT EXECUTE to `anon` ONLY on genuinely public read helpers
--   4) Trigger functions never need EXECUTE grants — they run under table owner

DO $$
DECLARE
  f record;
BEGIN
  FOR f IN
    SELECT n.nspname AS schema, p.proname AS name,
           pg_catalog.pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef = true
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM PUBLIC, anon, authenticated',
                   f.schema, f.name, f.args);
  END LOOP;
END $$;

-- ============================================================
-- Public (anon) read helpers — keep callable without auth
-- ============================================================
DO $$
DECLARE
  fn text;
  public_fns text[] := ARRAY[
    'achievement_rarity',
    'founder_program_public_status',
    'get_category_leaderboard',
    'get_crown_map_public_points',
    'get_crowned_post_map_points',
    'get_live_battle_highlight',
    'get_live_battle_vote_timeline',
    'get_post_public_voters',
    'get_post_share_status',
    'get_post_vote_stats',
    'is_feature_enabled',
    'frame_reward_stats',
    'count_post_votes_by_type',
    'live_battle_viewer_count',
    'live_battle_body_matches_keyword'
  ];
  sig record;
BEGIN
  FOREACH fn IN ARRAY public_fns LOOP
    FOR sig IN
      SELECT pg_catalog.pg_get_function_identity_arguments(p.oid) AS args
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = fn AND p.prosecdef = true
    LOOP
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO anon, authenticated', fn, sig.args);
    END LOOP;
  END LOOP;
END $$;

-- ============================================================
-- Authenticated-only RPCs — every other SECURITY DEFINER function
-- that is not a trigger and not already granted to anon above.
-- Triggers keep no EXECUTE grants (safe: they run via table owner).
-- ============================================================
DO $$
DECLARE
  f record;
BEGIN
  FOR f IN
    SELECT p.proname AS name,
           pg_catalog.pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
      AND pg_catalog.pg_get_function_result(p.oid) <> 'trigger'
      AND NOT has_function_privilege('anon', p.oid, 'EXECUTE') -- skip the ones we just re-granted
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated', f.name, f.args);
  END LOOP;
END $$;

-- service_role always retains full access via default role privileges;
-- no explicit grants needed there for functions.
