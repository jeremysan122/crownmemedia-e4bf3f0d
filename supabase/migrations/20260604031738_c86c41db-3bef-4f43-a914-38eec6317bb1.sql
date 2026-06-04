
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS vote_privacy text NOT NULL DEFAULT 'private';

DO $$ BEGIN
  ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_vote_privacy_check CHECK (vote_privacy IN ('private','public'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DROP POLICY IF EXISTS "Votes are viewable by authenticated users" ON public.votes;

CREATE POLICY "Users can see their own votes"
  ON public.votes FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Public voters are visible"
  ON public.votes FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = votes.user_id AND p.vote_privacy = 'public'
  ));

CREATE POLICY "Admins can read all votes"
  ON public.votes FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.get_post_vote_stats(_post_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'counts', COALESCE((
      SELECT jsonb_object_agg(vt, n)
      FROM (
        SELECT vote_type::text AS vt, count(*)::int AS n
        FROM public.votes
        WHERE post_id = _post_id
        GROUP BY vote_type
      ) s
    ), '{}'::jsonb),
    'my_votes', COALESCE((
      SELECT jsonb_agg(vote_type::text)
      FROM public.votes
      WHERE post_id = _post_id AND user_id = auth.uid()
    ), '[]'::jsonb)
  );
$$;

CREATE OR REPLACE FUNCTION public.get_post_public_voters(_post_id uuid, _limit int DEFAULT 50)
RETURNS TABLE(user_id uuid, username text, profile_photo_url text, vote_type text, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT v.user_id, p.username, p.profile_photo_url, v.vote_type::text, v.created_at
  FROM public.votes v
  JOIN public.profiles p ON p.id = v.user_id
  WHERE v.post_id = _post_id AND p.vote_privacy = 'public'
  ORDER BY v.created_at DESC
  LIMIT GREATEST(_limit, 1);
$$;

CREATE OR REPLACE FUNCTION public.count_post_votes_by_type(_post_ids uuid[], _vote_type text)
RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT count(*)::bigint
  FROM public.votes
  WHERE post_id = ANY(_post_ids) AND vote_type::text = _vote_type;
$$;

CREATE OR REPLACE FUNCTION public.get_user_liked_post_ids(_user_id uuid, _limit int DEFAULT 60)
RETURNS TABLE(post_id uuid, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT v.post_id, v.created_at
  FROM public.votes v
  JOIN public.profiles p ON p.id = v.user_id
  WHERE v.user_id = _user_id
    AND (v.user_id = auth.uid() OR p.liked_posts_public = true)
  ORDER BY v.created_at DESC
  LIMIT GREATEST(_limit, 1);
$$;

GRANT EXECUTE ON FUNCTION public.get_post_vote_stats(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_post_public_voters(uuid, int) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.count_post_votes_by_type(uuid[], text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_liked_post_ids(uuid, int) TO authenticated;

REVOKE SELECT ON public.profiles FROM anon, authenticated;

GRANT SELECT (
  id, username, profile_photo_url, bio, city, state, country,
  followers_count, following_count, votes_received, votes_given,
  crowns_held, crowns_total, battle_wins,
  is_suspended, is_banned, banned_at,
  created_at, updated_at,
  banner_url, banner_position_y, avatar_position_y,
  liked_posts_public, gender, pronouns,
  is_private, hide_likes, hide_comments, hide_views,
  posts_visibility, links, locale,
  default_post_visibility, default_category, default_comments_enabled,
  watermark_enabled, autosave_to_camera_roll,
  who_can_tag, who_can_mention, who_can_dm, tag_review_required,
  reduce_motion, larger_text, high_contrast, captions_default_on,
  autoplay_cellular, quiet_hours_start, quiet_hours_end, timezone,
  push_likes, push_follows, push_comments, push_battles,
  default_battle_stake, auto_accept_battles_from_follows, default_race_scope,
  verified, verified_at, sensitive_content_mode,
  vote_privacy
) ON public.profiles TO anon, authenticated;
