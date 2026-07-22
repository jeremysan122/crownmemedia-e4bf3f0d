-- CrownMe full social-platform RLS and permission revision.
--
-- This migration is intentionally the final authority after the additive
-- 20260722134637 grant migration. It establishes a default-deny baseline,
-- rebuilds role grants from the policies that actually exist, restores the
-- column firewalls on profiles/posts/catalogs, and closes cross-table social
-- authorization gaps (blocks, private follows, comments, votes and DMs).

-- ============================================================================
-- 1. Schema-wide baseline: every public table uses RLS; PUBLIC and anon never
--    receive direct writes. Authenticated table grants are derived from RLS.
-- ============================================================================

REVOKE CREATE ON SCHEMA public FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM PUBLIC;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT n.nspname, c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relkind IN ('r', 'p')
  LOOP
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', r.nspname, r.relname);
  END LOOP;
END $$;

-- Reset the two client roles, then derive access from the final policy catalog.
-- service_role is deliberately not touched.
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC, anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

DO $$
DECLARE
  r record;
  v_privileges text;
  protected_tables constant text[] := ARRAY[
    'profiles', 'posts', 'comments', 'gift_transactions',
    'verification_requests', 'shekel_bundles', 'boost_bundles',
    'royal_pass_plans', 'follows'
  ];
  anon_read_tables constant text[] := ARRAY[
    'achievement_crowns', 'avatar_frame_collections', 'avatar_frames',
    'badges', 'battle_votes', 'battles', 'category_rankings',
    'category_tags', 'comment_reactions', 'creator_milestones', 'crowns',
    'founder_grants', 'founder_program_config', 'geo_public_centers',
    'gifts', 'main_categories', 'post_media', 'rank_snapshots',
    'share_cards', 'subcategories', 'titles', 'user_badges', 'user_titles'
  ];
BEGIN
  FOR r IN
    SELECT schemaname, tablename, cmd, roles
      FROM pg_policies
     WHERE schemaname = 'public'
       AND permissive = 'PERMISSIVE'
       AND NOT (tablename = ANY(protected_tables))
  LOOP
    v_privileges := CASE r.cmd
      WHEN 'ALL' THEN 'SELECT, INSERT, UPDATE, DELETE'
      ELSE r.cmd
    END;

    -- PUBLIC policies are usable by signed-in users. Explicit authenticated
    -- policies are too. RLS remains the row-level decision point.
    IF 'public' = ANY(r.roles) OR 'authenticated' = ANY(r.roles) THEN
      EXECUTE format('GRANT %s ON TABLE %I.%I TO authenticated',
                     v_privileges, r.schemaname, r.tablename);
    END IF;

    -- Signed-out callers are read-only, even if an old policy was declared TO
    -- PUBLIC for an INSERT/UPDATE/DELETE operation.
    IF r.cmd IN ('SELECT', 'ALL') AND (
         'anon' = ANY(r.roles)
         OR ('public' = ANY(r.roles) AND r.tablename = ANY(anon_read_tables))
       ) THEN
      EXECUTE format('GRANT SELECT ON TABLE %I.%I TO anon',
                     r.schemaname, r.tablename);
    END IF;
  END LOOP;
END $$;

-- Views are explicit; no view may accidentally retain an owner-bypass grant.
GRANT SELECT ON public.gift_transactions_public TO anon, authenticated;
GRANT SELECT ON public.trending_hashtags TO anon, authenticated;
REVOKE ALL ON public.royal_shield_accounting FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.royal_shield_accounting TO service_role;

-- No function receives implicit execution through the PostgreSQL PUBLIC role.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS signature
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.prokind = 'f'
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', r.signature);
  END LOOP;
END $$;

-- ============================================================================
-- 2. Profiles: public display fields only. Full owner data remains available
--    through get_my_profile(); admin operations use role-gated RPCs.
-- ============================================================================

DO $$
DECLARE all_columns text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
    INTO all_columns
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'profiles';
  REVOKE SELECT, INSERT, UPDATE ON public.profiles FROM PUBLIC, anon, authenticated;
  EXECUTE format('REVOKE SELECT (%s) ON public.profiles FROM PUBLIC, anon, authenticated', all_columns);
  EXECUTE format('REVOKE INSERT (%s) ON public.profiles FROM PUBLIC, anon, authenticated', all_columns);
  EXECUTE format('REVOKE UPDATE (%s) ON public.profiles FROM PUBLIC, anon, authenticated', all_columns);
END $$;

GRANT SELECT (
  id, username, profile_photo_url, banner_url, banner_position_y,
  avatar_position_y, bio, city, state, country, created_at, updated_at,
  crown_score, crowns_held, crowns_total, followers_count, following_count,
  battle_wins, votes_received, votes_given, gender, pronouns, links,
  is_private, liked_posts_public, hide_likes, hide_comments, hide_views,
  hide_recent_unlocks, posts_visibility, verified, verified_at, is_founder,
  founder_title, royal_frame_variant, equipped_frame_key,
  equipped_achievement_crown_id, equipped_avatar_frame_id, frames_hidden
) ON public.profiles TO anon;

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
) ON public.profiles TO authenticated;

-- Owner-controlled profile fields only. Moderation, verification, crowns,
-- balances, deletion state and entitlements are not client-writable columns.
GRANT INSERT (
  id, username, first_name, last_name, profile_photo_url, banner_url,
  banner_position_y, avatar_position_y, bio, city, state, country, gender,
  pronouns, links, is_private, liked_posts_public, hide_likes, hide_comments,
  hide_views, hide_recent_unlocks, posts_visibility, vote_privacy, locale,
  default_post_visibility, default_category, default_comments_enabled,
  watermark_enabled, autosave_to_camera_roll, who_can_tag, who_can_mention,
  who_can_dm, tag_review_required, push_likes, push_follows, push_comments,
  push_battles, autoplay_cellular, quiet_hours_start, quiet_hours_end,
  timezone, reduce_motion, larger_text, high_contrast, captions_default_on,
  sensitive_content_mode, default_battle_stake,
  auto_accept_battles_from_follows, default_race_scope, updated_at
) ON public.profiles TO authenticated;

GRANT UPDATE (
  id, username, first_name, last_name, profile_photo_url, banner_url,
  banner_position_y, avatar_position_y, bio, city, state, country, gender,
  pronouns, links, is_private, liked_posts_public, hide_likes, hide_comments,
  hide_views, hide_recent_unlocks, posts_visibility, vote_privacy, locale,
  default_post_visibility, default_category, default_comments_enabled,
  watermark_enabled, autosave_to_camera_roll, who_can_tag, who_can_mention,
  who_can_dm, tag_review_required, push_likes, push_follows, push_comments,
  push_battles, autoplay_cellular, quiet_hours_start, quiet_hours_end,
  timezone, reduce_motion, larger_text, high_contrast, captions_default_on,
  sensitive_content_mode, default_battle_stake,
  auto_accept_battles_from_follows, default_race_scope, updated_at
) ON public.profiles TO authenticated;

DROP VIEW IF EXISTS public.profiles_public;
CREATE VIEW public.profiles_public
WITH (security_invoker = true) AS
SELECT
  id, username, profile_photo_url, banner_url, banner_position_y,
  avatar_position_y, bio, gender, pronouns, city, state, country, links,
  followers_count, following_count, votes_received, votes_given, crowns_held,
  crowns_total, battle_wins, crown_score, verified, verified_at, is_founder,
  founder_title, royal_frame_variant, equipped_frame_key,
  equipped_avatar_frame_id, equipped_achievement_crown_id, frames_hidden,
  is_private, hide_likes, hide_comments, hide_views, hide_recent_unlocks,
  liked_posts_public, posts_visibility, created_at, updated_at
FROM public.profiles;

REVOKE ALL ON public.profiles_public FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.profiles_public TO anon, authenticated;
COMMENT ON VIEW public.profiles_public IS
  'RLS-aware, non-PII profile projection. Own private settings use get_my_profile().';

REVOKE ALL ON FUNCTION public.get_my_profile() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_profile() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_crown_asset_review() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_profile_status(
  _user_id uuid,
  _action text,
  _reason text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL OR NOT (
    public.is_any_admin(v_actor)
    OR public.has_role(v_actor, 'moderator'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;
  IF _user_id IS NULL OR _user_id = v_actor THEN
    RAISE EXCEPTION 'invalid_target' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.user_roles ur
     WHERE ur.user_id = _user_id
       AND ur.role IN (
         'moderator'::public.app_role, 'admin'::public.app_role,
         'super_admin'::public.app_role, 'finance_admin'::public.app_role,
         'security_admin'::public.app_role, 'content_admin'::public.app_role,
         'support_admin'::public.app_role
       )
  ) AND NOT public.has_role(v_actor, 'super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'super_admin_required_for_privileged_target' USING ERRCODE = '42501';
  END IF;

  CASE _action
    WHEN 'suspend' THEN
      UPDATE public.profiles SET is_suspended = true WHERE id = _user_id;
    WHEN 'unsuspend' THEN
      UPDATE public.profiles SET is_suspended = false WHERE id = _user_id;
    WHEN 'ban' THEN
      IF NOT (
        public.has_role(v_actor, 'admin'::public.app_role)
        OR public.has_role(v_actor, 'super_admin'::public.app_role)
        OR public.has_role(v_actor, 'security_admin'::public.app_role)
      ) THEN
        RAISE EXCEPTION 'admin_required' USING ERRCODE = '42501';
      END IF;
      UPDATE public.profiles
         SET is_banned = true, is_suspended = true, banned_at = now(),
             banned_by = v_actor, banned_reason = nullif(trim(_reason), '')
       WHERE id = _user_id;
    WHEN 'unban' THEN
      IF NOT (
        public.has_role(v_actor, 'admin'::public.app_role)
        OR public.has_role(v_actor, 'super_admin'::public.app_role)
        OR public.has_role(v_actor, 'security_admin'::public.app_role)
      ) THEN
        RAISE EXCEPTION 'admin_required' USING ERRCODE = '42501';
      END IF;
      UPDATE public.profiles
         SET is_banned = false, is_suspended = false, banned_at = NULL,
             banned_by = NULL, banned_reason = NULL
       WHERE id = _user_id;
    ELSE
      RAISE EXCEPTION 'invalid_action' USING ERRCODE = '22023';
  END CASE;

  IF NOT FOUND THEN RAISE EXCEPTION 'profile_not_found' USING ERRCODE = 'P0002'; END IF;
  INSERT INTO public.admin_audit_log(actor_id, action, target_type, target_id, details)
  VALUES (v_actor, 'profile_' || _action, 'user', _user_id::text,
          jsonb_build_object('reason', nullif(trim(_reason), '')));
END $$;
REVOKE ALL ON FUNCTION public.admin_set_profile_status(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_profile_status(uuid, text, text) TO authenticated;

-- ============================================================================
-- 3. Posts and interactions: remove internal/precise columns and make child
--    objects inherit parent visibility.
-- ============================================================================

REVOKE SELECT, INSERT, UPDATE ON public.posts FROM PUBLIC, anon, authenticated;
DO $$
DECLARE all_columns text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
    INTO all_columns FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'posts';
  EXECUTE format('REVOKE SELECT (%s) ON public.posts FROM PUBLIC, anon, authenticated', all_columns);
  EXECUTE format('REVOKE INSERT (%s) ON public.posts FROM PUBLIC, anon, authenticated', all_columns);
  EXECUTE format('REVOKE UPDATE (%s) ON public.posts FROM PUBLIC, anon, authenticated', all_columns);
END $$;

GRANT SELECT (
  id, user_id, image_url, image_urls, caption, category, main_category_slug,
  subcategory_slug, hashtags, city, state, country, crown_score, vote_count,
  comment_count, share_count, repost_count, battle_wins, created_at, edited_at,
  pinned_at, scheduled_for, parent_post_id, repost_caption, tagged_user_ids,
  media_type, video_url, video_poster_url, video_filter, photo_filter, filter,
  filter_type, duration_ms, alt_texts, aspect_ratio, media_width, media_height,
  media_origin, is_sensitive, content_type, content_rating, is_removed,
  is_archived, archived_at, moderation_status, publish_status,
  crown_shield_until, royal_boost_until, spotlight_until, vote_boost_until,
  location_enabled, location_source, location_label, region_name, region_type,
  post_location_precision
) ON public.posts TO anon, authenticated;

GRANT UPDATE (
  caption, category, hashtags, image_url, image_urls, alt_texts, filter,
  photo_filter, video_filter, filter_type, location_enabled, location_source,
  location_label, city, state, country, region_name, region_type,
  post_location_precision, edited_at, is_archived, archived_at, pinned_at,
  repost_caption
) ON public.posts TO authenticated;
GRANT DELETE ON public.posts TO authenticated;
-- New posts are created through publish_post_idempotent(), never raw INSERT.

CREATE OR REPLACE FUNCTION public.can_view_social_actor(_subject uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
     WHERE p.id = _subject
       AND NOT coalesce(p.is_banned, false)
       AND NOT coalesce(p.is_suspended, false)
       AND p.deactivated_at IS NULL
       AND p.deletion_requested_at IS NULL
  ) AND (
    auth.uid() IS NULL
    OR auth.uid() = _subject
    OR public.is_any_admin(auth.uid())
    OR public.has_role(auth.uid(), 'moderator'::public.app_role)
    OR NOT EXISTS (
      SELECT 1 FROM public.blocks b
       WHERE (b.blocker_id = auth.uid() AND b.blocked_id = _subject)
          OR (b.blocker_id = _subject AND b.blocked_id = auth.uid())
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_view_posts_of(_owner uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT CASE
    WHEN auth.uid() = _owner THEN true
    WHEN auth.uid() IS NOT NULL AND (
      public.is_any_admin(auth.uid())
      OR public.has_role(auth.uid(), 'moderator'::public.app_role)
    ) THEN true
    WHEN NOT public.can_view_social_actor(_owner) THEN false
    ELSE EXISTS (
      SELECT 1 FROM public.profiles p
       WHERE p.id = _owner
         AND p.posts_visibility = 'public'
         AND NOT p.is_private
    ) OR (
      auth.uid() IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.profiles p
         WHERE p.id = _owner
           AND p.posts_visibility <> 'private'
           AND (p.posts_visibility = 'followers' OR p.is_private)
      )
      AND EXISTS (
        SELECT 1 FROM public.follows f
         WHERE f.follower_id = auth.uid() AND f.following_id = _owner
      )
    )
  END;
$$;
REVOKE ALL ON FUNCTION public.can_view_social_actor(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_view_posts_of(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_view_social_actor(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_posts_of(uuid) TO anon, authenticated;

DROP POLICY IF EXISTS "Comments viewable by everyone" ON public.comments;
DROP POLICY IF EXISTS "Users can comment as themselves" ON public.comments;
DROP POLICY IF EXISTS "comments inherit visible parent" ON public.comments;
DROP POLICY IF EXISTS "anonymous comments inherit visible parent" ON public.comments;
DROP POLICY IF EXISTS "authenticated comments inherit visible parent" ON public.comments;
DROP POLICY IF EXISTS "comments insert on visible parent" ON public.comments;

-- Keep anonymous policy expressions free of admin-only helpers. Calling an
-- admin-role helper from an anon policy can turn an otherwise safe read into
-- `permission denied for function ...` even when the admin branch is false.
CREATE POLICY "anonymous comments inherit visible parent"
ON public.comments FOR SELECT TO anon
USING (
  NOT is_removed
  AND public.can_view_social_actor(user_id)
  AND EXISTS (SELECT 1 FROM public.posts p WHERE p.id = comments.post_id)
);

CREATE POLICY "authenticated comments inherit visible parent"
ON public.comments FOR SELECT TO authenticated
USING (
  auth.uid() = user_id
  OR public.is_any_admin(auth.uid())
  OR public.has_role(auth.uid(), 'moderator'::public.app_role)
  OR (
    NOT is_removed
    AND public.can_view_social_actor(user_id)
    AND EXISTS (SELECT 1 FROM public.posts p WHERE p.id = comments.post_id)
  )
);

CREATE POLICY "comments insert on visible parent"
ON public.comments FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND public.can_view_social_actor(user_id)
  AND EXISTS (SELECT 1 FROM public.posts p WHERE p.id = comments.post_id)
  AND public.comments_allowed_on(post_id)
);

REVOKE ALL ON public.comments FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.comments TO anon, authenticated;
GRANT INSERT, DELETE ON public.comments TO authenticated;
GRANT UPDATE (body, edited_at) ON public.comments TO authenticated;

DROP POLICY IF EXISTS "Users can vote as themselves" ON public.votes;
DROP POLICY IF EXISTS "votes insert on visible parent" ON public.votes;
CREATE POLICY "votes insert on visible parent"
ON public.votes FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND public.can_view_social_actor(user_id)
  AND EXISTS (SELECT 1 FROM public.posts p WHERE p.id = votes.post_id)
);

DROP POLICY IF EXISTS "comment_reactions viewable by everyone" ON public.comment_reactions;
DROP POLICY IF EXISTS "users add own comment reactions" ON public.comment_reactions;
CREATE POLICY "comment reactions inherit visible comment"
ON public.comment_reactions FOR SELECT TO anon, authenticated
USING (EXISTS (SELECT 1 FROM public.comments c WHERE c.id = comment_reactions.comment_id));
CREATE POLICY "comment reactions insert on visible comment"
ON public.comment_reactions FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (SELECT 1 FROM public.comments c WHERE c.id = comment_reactions.comment_id)
);

DROP POLICY IF EXISTS "users add own bookmarks" ON public.post_bookmarks;
CREATE POLICY "users add visible post bookmarks"
ON public.post_bookmarks FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (SELECT 1 FROM public.posts p WHERE p.id = post_bookmarks.post_id)
);

-- ============================================================================
-- 4. Private-account follow approval and block-safe social graph.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.follow_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  UNIQUE (requester_id, target_id),
  CHECK (requester_id <> target_id)
);
CREATE INDEX IF NOT EXISTS follow_requests_target_pending_idx
  ON public.follow_requests(target_id, created_at DESC) WHERE status = 'pending';
ALTER TABLE public.follow_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "follow requests involved read"
ON public.follow_requests FOR SELECT TO authenticated
USING (requester_id = auth.uid() OR target_id = auth.uid() OR public.is_any_admin(auth.uid()));

REVOKE ALL ON public.follow_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.follow_requests TO authenticated;
GRANT ALL ON public.follow_requests TO service_role;

DROP POLICY IF EXISTS "Follows viewable by everyone" ON public.follows;
DROP POLICY IF EXISTS "Users can follow as themselves" ON public.follows;
DROP POLICY IF EXISTS "Users can unfollow themselves" ON public.follows;
DROP POLICY IF EXISTS "follow graph visible by relationship privacy" ON public.follows;
DROP POLICY IF EXISTS "anonymous follow graph visible by relationship privacy" ON public.follows;
DROP POLICY IF EXISTS "authenticated follow graph visible by relationship privacy" ON public.follows;
CREATE POLICY "anonymous follow graph visible by relationship privacy"
ON public.follows FOR SELECT TO anon
USING (
  public.can_view_posts_of(follower_id) AND public.can_view_posts_of(following_id)
);
CREATE POLICY "authenticated follow graph visible by relationship privacy"
ON public.follows FOR SELECT TO authenticated
USING (
  follower_id = auth.uid()
  OR following_id = auth.uid()
  OR public.is_any_admin(auth.uid())
  OR public.has_role(auth.uid(), 'moderator'::public.app_role)
  OR (public.can_view_posts_of(follower_id) AND public.can_view_posts_of(following_id))
);
REVOKE ALL ON public.follows FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.follows TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.set_follow_state(_target_id uuid, _follow boolean)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_private boolean;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501'; END IF;
  IF _target_id IS NULL OR _target_id = v_me THEN RAISE EXCEPTION 'invalid_target' USING ERRCODE = '22023'; END IF;
  IF NOT public.can_view_social_actor(v_me) OR NOT public.can_view_social_actor(_target_id) THEN
    RAISE EXCEPTION 'target_unavailable' USING ERRCODE = '42501';
  END IF;

  IF NOT _follow THEN
    DELETE FROM public.follows WHERE follower_id = v_me AND following_id = _target_id;
    UPDATE public.follow_requests SET status = 'cancelled', responded_at = now()
     WHERE requester_id = v_me AND target_id = _target_id AND status = 'pending';
    RETURN 'none';
  END IF;

  IF EXISTS (SELECT 1 FROM public.follows WHERE follower_id = v_me AND following_id = _target_id) THEN
    RETURN 'following';
  END IF;
  SELECT is_private INTO v_private FROM public.profiles WHERE id = _target_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'profile_not_found' USING ERRCODE = 'P0002'; END IF;

  IF v_private THEN
    INSERT INTO public.follow_requests(requester_id, target_id, status, responded_at)
    VALUES (v_me, _target_id, 'pending', NULL)
    ON CONFLICT (requester_id, target_id) DO UPDATE
      SET status = 'pending', created_at = now(), responded_at = NULL;
    RETURN 'requested';
  END IF;

  INSERT INTO public.follows(follower_id, following_id)
  VALUES (v_me, _target_id) ON CONFLICT DO NOTHING;
  UPDATE public.follow_requests SET status = 'accepted', responded_at = now()
   WHERE requester_id = v_me AND target_id = _target_id;
  RETURN 'following';
END $$;

CREATE OR REPLACE FUNCTION public.get_follow_state(_target_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN 'none'
    WHEN EXISTS (SELECT 1 FROM public.follows f
                  WHERE f.follower_id = auth.uid() AND f.following_id = _target_id)
      THEN 'following'
    WHEN EXISTS (SELECT 1 FROM public.follow_requests r
                  WHERE r.requester_id = auth.uid() AND r.target_id = _target_id
                    AND r.status = 'pending')
      THEN 'requested'
    ELSE 'none'
  END;
$$;

CREATE OR REPLACE FUNCTION public.respond_follow_request(_request_id uuid, _accept boolean)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_requester uuid;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501'; END IF;
  SELECT requester_id INTO v_requester
    FROM public.follow_requests
   WHERE id = _request_id AND target_id = v_me AND status = 'pending'
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'request_not_found' USING ERRCODE = 'P0002'; END IF;

  IF _accept AND public.can_view_social_actor(v_requester) THEN
    INSERT INTO public.follows(follower_id, following_id)
    VALUES (v_requester, v_me) ON CONFLICT DO NOTHING;
    UPDATE public.follow_requests SET status = 'accepted', responded_at = now()
     WHERE id = _request_id;
    RETURN 'accepted';
  END IF;
  UPDATE public.follow_requests SET status = 'rejected', responded_at = now()
   WHERE id = _request_id;
  RETURN 'rejected';
END $$;

REVOKE ALL ON FUNCTION public.set_follow_state(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_follow_state(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.respond_follow_request(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_follow_state(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_follow_state(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.respond_follow_request(uuid, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.follows_enforce_approved_relationship()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.role() = 'service_role' THEN RETURN NEW; END IF;
  IF EXISTS (
    SELECT 1 FROM public.blocks b
     WHERE (b.blocker_id = NEW.follower_id AND b.blocked_id = NEW.following_id)
        OR (b.blocker_id = NEW.following_id AND b.blocked_id = NEW.follower_id)
  ) THEN
    RAISE EXCEPTION 'follow_blocked' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = NEW.following_id AND p.is_private)
     AND NOT (
       auth.uid() = NEW.following_id
       AND EXISTS (
         SELECT 1 FROM public.follow_requests r
          WHERE r.requester_id = NEW.follower_id
            AND r.target_id = NEW.following_id
            AND r.status = 'pending'
       )
     ) THEN
    RAISE EXCEPTION 'follow_approval_required' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_follows_enforce_approved_relationship ON public.follows;
CREATE TRIGGER trg_follows_enforce_approved_relationship
BEFORE INSERT ON public.follows
FOR EACH ROW EXECUTE FUNCTION public.follows_enforce_approved_relationship();
REVOKE ALL ON FUNCTION public.follows_enforce_approved_relationship() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.blocks_remove_relationships()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  DELETE FROM public.follows
   WHERE (follower_id = NEW.blocker_id AND following_id = NEW.blocked_id)
      OR (follower_id = NEW.blocked_id AND following_id = NEW.blocker_id);
  UPDATE public.follow_requests SET status = 'cancelled', responded_at = now()
   WHERE status = 'pending'
     AND ((requester_id = NEW.blocker_id AND target_id = NEW.blocked_id)
       OR (requester_id = NEW.blocked_id AND target_id = NEW.blocker_id));
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_blocks_remove_relationships ON public.blocks;
CREATE TRIGGER trg_blocks_remove_relationships
AFTER INSERT ON public.blocks
FOR EACH ROW EXECUTE FUNCTION public.blocks_remove_relationships();
REVOKE ALL ON FUNCTION public.blocks_remove_relationships() FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 5. DM permission settings, blocking, and shared-content visibility.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.can_send_dm_to(_recipient uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT auth.uid() IS NOT NULL
    AND _recipient IS NOT NULL
    AND _recipient <> auth.uid()
    AND public.can_view_social_actor(_recipient)
    AND EXISTS (
      SELECT 1 FROM public.profiles p
       WHERE p.id = _recipient
         AND (
           p.who_can_dm = 'everyone'
           OR (
             p.who_can_dm = 'followers'
             AND EXISTS (
               SELECT 1 FROM public.follows f
                WHERE f.follower_id = auth.uid() AND f.following_id = _recipient
             )
           )
         )
    );
$$;
REVOKE ALL ON FUNCTION public.can_send_dm_to(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_send_dm_to(uuid) TO authenticated;

DROP POLICY IF EXISTS "Users send DMs as themselves" ON public.messages;
CREATE POLICY "Users send permitted DMs as themselves"
ON public.messages FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = sender_id
  AND kind = 'text'
  AND gift_transaction_id IS NULL
  AND public.can_send_dm_to(receiver_id)
);

CREATE OR REPLACE FUNCTION public.messages_enforce_social_permissions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN
    IF auth.uid() IS NULL OR NEW.sender_id <> auth.uid()
       OR NOT public.can_send_dm_to(NEW.receiver_id) THEN
      RAISE EXCEPTION 'dm_not_allowed' USING ERRCODE = '42501';
    END IF;
    IF NEW.shared_post_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.posts p
       WHERE p.id = NEW.shared_post_id
         AND NOT p.is_removed AND NOT p.is_archived
         AND p.publish_status = 'approved'
         AND (p.scheduled_for IS NULL OR p.scheduled_for <= now())
         AND public.can_view_posts_of(p.user_id)
    ) THEN
      RAISE EXCEPTION 'shared_post_not_visible' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_messages_enforce_social_permissions ON public.messages;
CREATE TRIGGER trg_messages_enforce_social_permissions
BEFORE INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.messages_enforce_social_permissions();
REVOKE ALL ON FUNCTION public.messages_enforce_social_permissions() FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 6. Sensitive/financial domains: owners may read through RLS, but browser
--    clients never mutate balances, ledgers, Stripe state, payouts or grants.
-- ============================================================================

DO $$
DECLARE
  t text;
  financial_tables text[] := ARRAY[
    'wallets', 'wallet_ledger', 'shekel_ledger', 'boost_token_ledger',
    'boost_token_lots', 'shekel_credit_lots', 'shekel_spend_allocations',
    'shekel_spend_reversals', 'payment_transactions', 'payouts',
    'connect_accounts', 'stripe_events', 'gift_transactions',
    'royal_pass_subscriptions', 'royal_pass_grants', 'royal_pass_reversals',
    'royal_pass_shield_allowances', 'royal_pass_gift_allocations',
    'royal_pass_boost_claim_failures', 'debit_operations'
  ];
BEGIN
  FOREACH t IN ARRAY financial_tables LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON public.%I FROM anon, authenticated', t);
    END IF;
  END LOOP;
END $$;

-- Public gift feed remains a deliberately non-sensitive projection.
GRANT SELECT (
  id, sender_id, receiver_id, post_id, gift_id, gift_name, quantity,
  total_shekels, created_at, status
) ON public.gift_transactions TO anon, authenticated;

-- Catalogs never expose provider price identifiers to browser roles.
REVOKE ALL ON public.shekel_bundles FROM anon, authenticated;
GRANT SELECT (id, active, created_at, label, shekels, sort_order, usd)
  ON public.shekel_bundles TO anon, authenticated;
REVOKE ALL ON public.boost_bundles FROM anon, authenticated;
GRANT SELECT (id, active, boost_type, created_at, duration_hours, label, sort_order, usd)
  ON public.boost_bundles TO anon, authenticated;
REVOKE ALL ON public.royal_pass_plans FROM anon, authenticated;
GRANT SELECT (id, active, created_at, description, interval, name, sort_order, updated_at, usd)
  ON public.royal_pass_plans TO anon, authenticated;

-- Verification owners can read/create their own rows; only safe application
-- fields are editable. Admin decisions go through admin_decide_verification().
GRANT SELECT, INSERT ON public.verification_requests TO authenticated;
GRANT UPDATE (
  legal_name, category, brand_name, website_url, social_links, follower_count,
  reason, id_document_path, business_document_path, selfie_path, updated_at
) ON public.verification_requests TO authenticated;

-- ============================================================================
-- 7. Storage and Realtime: preserve intentional public media reads, require
--    owner-folder writes, and keep sensitive/private buckets non-public.
-- ============================================================================

UPDATE storage.buckets SET public = false
 WHERE id IN ('dm-attachments', 'evidence', 'verification-docs', 'achievement-crowns-v2-masters');

-- Remove obsolete permissive upload policies if they survived an older stack.
DROP POLICY IF EXISTS "Authed upload avatars" ON storage.objects;
DROP POLICY IF EXISTS "Authed upload posts" ON storage.objects;
DROP POLICY IF EXISTS "Authed upload share-cards" ON storage.objects;

-- Realtime row delivery still passes each subscriber's table RLS. These are
-- intentional user-facing streams; sensitive moderation/report tables stay out.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='messages') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='notifications') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='live_battle_reports') THEN
      ALTER PUBLICATION supabase_realtime DROP TABLE public.live_battle_reports;
    END IF;
  END IF;
END $$;

-- ============================================================================
-- 8. Deploy-time invariants. Fail the migration instead of shipping a partial
--    permission state.
-- ============================================================================

DO $$
DECLARE missing_rls text;
BEGIN
  SELECT string_agg(format('%I.%I', n.nspname, c.relname), ', ')
    INTO missing_rls
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind IN ('r','p') AND NOT c.relrowsecurity;
  IF missing_rls IS NOT NULL THEN RAISE EXCEPTION 'RLS disabled on: %', missing_rls; END IF;

  IF has_table_privilege('anon', 'public.profiles', 'INSERT')
     OR has_table_privilege('anon', 'public.posts', 'INSERT')
     OR has_table_privilege('anon', 'public.messages', 'INSERT')
     OR has_table_privilege('anon', 'public.wallets', 'SELECT')
     OR has_table_privilege('anon', 'public.user_roles', 'SELECT')
     OR has_table_privilege('anon', 'public.moderation_audit', 'SELECT')
     OR has_table_privilege('anon', 'public.reports', 'SELECT')
     OR has_table_privilege('anon', 'public.stripe_events', 'SELECT')
     OR has_table_privilege('authenticated', 'public.wallets', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.shekel_ledger', 'INSERT')
     OR has_table_privilege('authenticated', 'public.follows', 'INSERT') THEN
    RAISE EXCEPTION 'unsafe table-level write grant remains';
  END IF;

  IF has_table_privilege('anon', 'public.posts', 'SELECT')
     OR has_table_privilege('authenticated', 'public.posts', 'SELECT')
     OR has_table_privilege('authenticated', 'public.profiles', 'SELECT') THEN
    RAISE EXCEPTION 'column firewall overridden by table-level SELECT';
  END IF;

  IF has_column_privilege('anon', 'public.posts', 'post_lat', 'SELECT')
     OR has_column_privilege('authenticated', 'public.posts', 'post_lng', 'SELECT')
     OR has_column_privilege('authenticated', 'public.posts', 'submission_key', 'SELECT')
     OR has_column_privilege('authenticated', 'public.posts', 'moderation_notes', 'SELECT')
     OR has_column_privilege('authenticated', 'public.profiles', 'banned_reason', 'SELECT')
     OR has_column_privilege('anon', 'public.profiles', 'first_name', 'SELECT')
     OR has_column_privilege('authenticated', 'public.shekel_bundles', 'stripe_price_id', 'SELECT') THEN
    RAISE EXCEPTION 'protected column is readable by a browser role';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
