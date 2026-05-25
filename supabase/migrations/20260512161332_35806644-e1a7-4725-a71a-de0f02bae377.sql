
-- ============ 1. POSTS: archive + hashtags ============
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS hashtags text[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_posts_hashtags ON public.posts USING GIN (hashtags);
CREATE INDEX IF NOT EXISTS idx_posts_archived ON public.posts (user_id, is_archived);

-- Hashtag extraction trigger
CREATE OR REPLACE FUNCTION public.posts_extract_hashtags()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE v_tags text[];
BEGIN
  IF NEW.caption IS NULL OR length(NEW.caption) = 0 THEN
    NEW.hashtags := '{}';
    RETURN NEW;
  END IF;
  SELECT COALESCE(array_agg(DISTINCT lower(m[1])), '{}')
    INTO v_tags
    FROM regexp_matches(NEW.caption, '#([A-Za-z0-9_]{2,40})', 'g') AS m;
  NEW.hashtags := v_tags;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_posts_extract_hashtags ON public.posts;
CREATE TRIGGER trg_posts_extract_hashtags
  BEFORE INSERT OR UPDATE OF caption ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.posts_extract_hashtags();

-- Backfill hashtags for existing posts
UPDATE public.posts SET caption = caption WHERE caption IS NOT NULL;

-- Trending hashtags view (last 48 hours, decay-weighted by crown_score)
CREATE OR REPLACE VIEW public.trending_hashtags
WITH (security_invoker=on) AS
  SELECT
    tag,
    COUNT(*)::int AS post_count,
    SUM(GREATEST(crown_score, 1))::numeric AS score,
    MAX(created_at) AS last_used_at
  FROM (
    SELECT unnest(hashtags) AS tag, crown_score, created_at
    FROM public.posts
    WHERE is_removed = false
      AND is_archived = false
      AND created_at > now() - interval '48 hours'
      AND array_length(hashtags, 1) > 0
  ) t
  GROUP BY tag
  ORDER BY score DESC, post_count DESC
  LIMIT 50;

-- ============ 2. POST_DRAFTS table ============
CREATE TABLE IF NOT EXISTS public.post_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  caption text DEFAULT '',
  category text,
  city text,
  state text,
  country text,
  photo_filter text,
  image_urls text[] NOT NULL DEFAULT '{}',
  cover_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.post_drafts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners read their drafts" ON public.post_drafts;
CREATE POLICY "Owners read their drafts" ON public.post_drafts
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Owners insert drafts" ON public.post_drafts;
CREATE POLICY "Owners insert drafts" ON public.post_drafts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Owners update drafts" ON public.post_drafts;
CREATE POLICY "Owners update drafts" ON public.post_drafts
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Owners delete drafts" ON public.post_drafts;
CREATE POLICY "Owners delete drafts" ON public.post_drafts
  FOR DELETE USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS trg_post_drafts_touch ON public.post_drafts;
CREATE TRIGGER trg_post_drafts_touch
  BEFORE UPDATE ON public.post_drafts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX IF NOT EXISTS idx_post_drafts_user ON public.post_drafts (user_id, updated_at DESC);

-- ============ 3. PROFILES: deactivation + links ============
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS deactivated_at timestamptz,
  ADD COLUMN IF NOT EXISTS deletion_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS links jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Validate links: array of {label, url}, max 3, https only
CREATE OR REPLACE FUNCTION public.profiles_validate_links()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_item jsonb;
  v_url text;
  v_label text;
BEGIN
  IF NEW.links IS NULL THEN
    NEW.links := '[]'::jsonb;
    RETURN NEW;
  END IF;
  IF jsonb_typeof(NEW.links) <> 'array' THEN
    RAISE EXCEPTION 'links must be a JSON array';
  END IF;
  IF jsonb_array_length(NEW.links) > 3 THEN
    RAISE EXCEPTION 'You can add up to 3 profile links';
  END IF;
  FOR v_item IN SELECT * FROM jsonb_array_elements(NEW.links) LOOP
    v_url := v_item->>'url';
    v_label := COALESCE(v_item->>'label', '');
    IF v_url IS NULL OR length(v_url) = 0 THEN
      RAISE EXCEPTION 'Each link must include a url';
    END IF;
    IF v_url !~* '^https://' THEN
      RAISE EXCEPTION 'Links must start with https://';
    END IF;
    IF length(v_url) > 300 THEN
      RAISE EXCEPTION 'Link URL is too long (max 300 chars)';
    END IF;
    IF length(v_label) > 40 THEN
      RAISE EXCEPTION 'Link label is too long (max 40 chars)';
    END IF;
  END LOOP;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_profiles_validate_links ON public.profiles;
CREATE TRIGGER trg_profiles_validate_links
  BEFORE INSERT OR UPDATE OF links ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_validate_links();

-- ============ 4. Visibility helper: exclude deactivated + archived ============
CREATE OR REPLACE FUNCTION public.can_view_posts_of(_owner uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    CASE
      WHEN auth.uid() = _owner THEN true
      WHEN auth.uid() IS NOT NULL AND (
        public.has_role(auth.uid(), 'admin'::app_role)
        OR public.has_role(auth.uid(), 'moderator'::app_role)
      ) THEN true
      WHEN EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = _owner AND p.deactivated_at IS NOT NULL) THEN false
      ELSE EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = _owner
          AND p.posts_visibility = 'public'
          AND p.is_private = false
      ) OR (
        auth.uid() IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = _owner
            AND p.posts_visibility <> 'private'
            AND (p.posts_visibility = 'followers' OR p.is_private = true)
        )
        AND EXISTS (
          SELECT 1 FROM public.follows f
          WHERE f.following_id = _owner AND f.follower_id = auth.uid()
        )
      )
    END;
$$;

-- ============ 5. Account management RPCs ============
CREATE OR REPLACE FUNCTION public.deactivate_my_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  UPDATE public.profiles
    SET deactivated_at = now()
    WHERE id = auth.uid();
END $$;

CREATE OR REPLACE FUNCTION public.reactivate_my_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  UPDATE public.profiles
    SET deactivated_at = NULL,
        deletion_requested_at = NULL
    WHERE id = auth.uid();
END $$;

CREATE OR REPLACE FUNCTION public.request_account_deletion()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_at timestamptz := now();
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  UPDATE public.profiles
    SET deletion_requested_at = v_at,
        deactivated_at = COALESCE(deactivated_at, v_at)
    WHERE id = auth.uid();
  RETURN jsonb_build_object('ok', true, 'requested_at', v_at, 'final_at', v_at + interval '30 days');
END $$;

CREATE OR REPLACE FUNCTION public.cancel_account_deletion()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  UPDATE public.profiles
    SET deletion_requested_at = NULL,
        deactivated_at = NULL
    WHERE id = auth.uid();
END $$;

REVOKE EXECUTE ON FUNCTION public.deactivate_my_account() FROM anon;
REVOKE EXECUTE ON FUNCTION public.reactivate_my_account() FROM anon;
REVOKE EXECUTE ON FUNCTION public.request_account_deletion() FROM anon;
REVOKE EXECUTE ON FUNCTION public.cancel_account_deletion() FROM anon;

-- ============ 6. Realtime publication for posts + notifications ============
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.posts;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

ALTER TABLE public.posts REPLICA IDENTITY FULL;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
