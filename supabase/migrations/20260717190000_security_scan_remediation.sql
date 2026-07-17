-- Launch security remediation:
--   * restore a strict public display allowlist for profiles
--   * keep pending/declined/cancelled battles participant-only
--   * remove sensitive moderation reports from Realtime
--   * pin the final mutable function search_path

-- A later blanket GRANT accidentally overrode the earlier profile allowlist.
-- Clear both table-level and column-level SELECT privileges before restoring
-- only fields that are intentionally rendered on public CrownMe surfaces.
DO $$
DECLARE
  all_profile_columns text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
    INTO all_profile_columns
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'profiles';

  REVOKE SELECT ON public.profiles FROM PUBLIC, anon, authenticated;
  EXECUTE format(
    'REVOKE SELECT (%s) ON public.profiles FROM PUBLIC, anon, authenticated',
    all_profile_columns
  );
END $$;

GRANT SELECT (
  id, username, profile_photo_url, banner_url, banner_position_y,
  avatar_position_y, bio, city, state, country, created_at, updated_at,
  crown_score, crowns_held, crowns_total, followers_count, following_count,
  battle_wins, votes_received, votes_given, gender, pronouns, links,
  is_private, liked_posts_public, hide_likes, hide_comments, hide_views,
  hide_recent_unlocks, posts_visibility, verified, verified_at, is_founder,
  founder_title, royal_frame_variant, equipped_frame_key,
  equipped_achievement_crown_id, equipped_avatar_frame_id, frames_hidden,
  is_banned, is_suspended
) ON public.profiles TO anon, authenticated;

GRANT SELECT ON public.profiles TO service_role;

DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Public profiles are viewable" ON public.profiles;
DROP POLICY IF EXISTS "Public profile fields viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Profiles readable by authenticated" ON public.profiles;
DROP POLICY IF EXISTS "Profiles readable by anon (non-PII via grants)" ON public.profiles;
DROP POLICY IF EXISTS "Profiles readable by anon" ON public.profiles;

CREATE POLICY "Public active profiles readable by anon"
  ON public.profiles
  FOR SELECT
  TO anon
  USING (
    NOT is_banned
    AND NOT is_suspended
    AND deactivated_at IS NULL
    AND deletion_requested_at IS NULL
  );

CREATE POLICY "Public, own, and moderated profiles readable by authenticated"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    id = auth.uid()
    OR (
      NOT is_banned
      AND NOT is_suspended
      AND deactivated_at IS NULL
      AND deletion_requested_at IS NULL
    )
    OR public.is_any_admin(auth.uid())
    OR public.has_role(auth.uid(), 'moderator'::public.app_role)
  );

-- Full own-profile reads stay behind the owner-only SECURITY DEFINER RPC.
REVOKE ALL ON FUNCTION public.get_my_profile() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_profile() TO authenticated;

-- Public audiences should see only accepted/live or finished battles. Pending
-- negotiation and declined/cancelled rows remain visible to participants and
-- moderators so invitation and audit flows continue to work.
DROP POLICY IF EXISTS "Battles viewable by everyone" ON public.battles;
DROP POLICY IF EXISTS "Public active battles readable by anon" ON public.battles;
DROP POLICY IF EXISTS "Public and participant battles readable by authenticated" ON public.battles;

CREATE POLICY "Public active battles readable by anon"
  ON public.battles
  FOR SELECT
  TO anon
  USING (status IN ('active'::public.battle_status, 'completed'::public.battle_status));

CREATE POLICY "Public and participant battles readable by authenticated"
  ON public.battles
  FOR SELECT
  TO authenticated
  USING (
    status IN ('active'::public.battle_status, 'completed'::public.battle_status)
    OR auth.uid() = challenger_id
    OR auth.uid() = opponent_id
    OR public.is_any_admin(auth.uid())
    OR public.has_role(auth.uid(), 'moderator'::public.app_role)
  );

-- Report reasons and reporter identities are sensitive. The app now polls the
-- owner/admin RPC views, so the table no longer needs replication exposure.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime'
       AND schemaname = 'public'
       AND tablename = 'live_battle_reports'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.live_battle_reports;
  END IF;
END $$;

ALTER TABLE public.live_battle_reports REPLICA IDENTITY DEFAULT;

-- Supabase lint 0011: this immutable SQL helper was the final public function
-- without an explicit path. pg_catalog comes first for built-in resolution.
ALTER FUNCTION public.collection_completion_title_slug(text)
  SET search_path = pg_catalog, public;
