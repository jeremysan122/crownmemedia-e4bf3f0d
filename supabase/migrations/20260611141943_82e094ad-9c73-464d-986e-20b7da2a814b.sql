
-- ============================================================
-- 1. posts: client_request_id + publish_status
-- ============================================================
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS client_request_id text,
  ADD COLUMN IF NOT EXISTS publish_status text NOT NULL DEFAULT 'approved'
    CHECK (publish_status IN ('draft','processing','pending_review','approved','rejected'));

CREATE UNIQUE INDEX IF NOT EXISTS posts_user_client_request_id_uniq
  ON public.posts (user_id, client_request_id)
  WHERE client_request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_posts_publish_status
  ON public.posts (publish_status)
  WHERE publish_status <> 'approved';

-- ============================================================
-- 2. Tighten public visibility: only approved posts are public
-- ============================================================
-- Drop existing public SELECT policies, then re-add a single safe one.
DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT policyname FROM pg_policies
    WHERE schemaname='public' AND tablename='posts' AND cmd='SELECT'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.posts', p.policyname);
  END LOOP;
END $$;

CREATE POLICY "posts_public_read_approved"
  ON public.posts FOR SELECT
  USING (
    is_removed = false
    AND is_archived = false
    AND publish_status = 'approved'
  );

CREATE POLICY "posts_owner_read_any"
  ON public.posts FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "posts_admin_read_any"
  ON public.posts FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator'));

-- Prevent users from forcing their own post to approved.
CREATE OR REPLACE FUNCTION public.posts_guard_publish_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.publish_status IS DISTINCT FROM OLD.publish_status
     AND NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator')) THEN
    -- owners may only move approved->draft (archive-like) or keep it the same
    IF NEW.publish_status NOT IN ('draft', OLD.publish_status) THEN
      RAISE EXCEPTION 'Only moderators can change publish_status to %', NEW.publish_status;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_posts_guard_publish_status ON public.posts;
CREATE TRIGGER trg_posts_guard_publish_status
  BEFORE UPDATE ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.posts_guard_publish_status();

-- ============================================================
-- 3. Idempotent publish RPC
-- ============================================================
CREATE OR REPLACE FUNCTION public.publish_post_idempotent(
  p_client_request_id text,
  p_payload jsonb
)
RETURNS public.posts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.posts;
  v_initial_status text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_client_request_id IS NULL OR length(p_client_request_id) < 8 THEN
    RAISE EXCEPTION 'client_request_id required';
  END IF;

  -- Return existing row if already published with same key
  SELECT * INTO v_row
    FROM public.posts
    WHERE user_id = v_uid AND client_request_id = p_client_request_id
    LIMIT 1;
  IF FOUND THEN
    RETURN v_row;
  END IF;

  -- All new posts go through moderation gate by default
  v_initial_status := COALESCE(p_payload->>'publish_status', 'pending_review');
  IF v_initial_status = 'approved' THEN
    -- never trust client "approved"
    v_initial_status := 'pending_review';
  END IF;

  INSERT INTO public.posts (
    user_id, client_request_id, publish_status,
    image_url, image_urls, caption, category,
    city, state, country,
    media_type, video_url, video_poster_url, duration_ms,
    filter, photo_filter, video_filter, filter_type,
    alt_texts, media_width, media_height,
    hashtags, tagged_user_ids, main_category_slug, subcategory_slug,
    is_sensitive, sensitive_reason, content_rating, media_origin
  )
  VALUES (
    v_uid, p_client_request_id, v_initial_status,
    COALESCE(p_payload->>'image_url',''),
    COALESCE((SELECT array_agg(x) FROM jsonb_array_elements_text(p_payload->'image_urls') x), '{}'::text[]),
    COALESCE(p_payload->>'caption',''),
    COALESCE((p_payload->>'category')::crown_category, 'overall'::crown_category),
    p_payload->>'city', p_payload->>'state', p_payload->>'country',
    COALESCE(p_payload->>'media_type','image'),
    p_payload->>'video_url', p_payload->>'video_poster_url',
    NULLIF(p_payload->>'duration_ms','')::int,
    p_payload->>'filter', p_payload->>'photo_filter', p_payload->>'video_filter', p_payload->>'filter_type',
    COALESCE((SELECT array_agg(x) FROM jsonb_array_elements_text(p_payload->'alt_texts') x), '{}'::text[]),
    NULLIF(p_payload->>'media_width','')::int,
    NULLIF(p_payload->>'media_height','')::int,
    COALESCE((SELECT array_agg(x) FROM jsonb_array_elements_text(p_payload->'hashtags') x), '{}'::text[]),
    COALESCE((SELECT array_agg(x::uuid) FROM jsonb_array_elements_text(p_payload->'tagged_user_ids') x), '{}'::uuid[]),
    p_payload->>'main_category_slug', p_payload->>'subcategory_slug',
    COALESCE((p_payload->>'is_sensitive')::boolean, false),
    p_payload->>'sensitive_reason',
    COALESCE((p_payload->>'content_rating')::content_rating, 'safe'::content_rating),
    p_payload->>'media_origin'
  )
  ON CONFLICT (user_id, client_request_id) WHERE client_request_id IS NOT NULL
  DO UPDATE SET caption = public.posts.caption  -- no-op to RETURNING
  RETURNING * INTO v_row;

  RETURN v_row;
END $$;

GRANT EXECUTE ON FUNCTION public.publish_post_idempotent(text, jsonb) TO authenticated;

-- ============================================================
-- 4. post_edits_audit
-- ============================================================
CREATE TABLE IF NOT EXISTS public.post_edits_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  editor_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  changed_fields text[] NOT NULL DEFAULT '{}',
  previous_values jsonb NOT NULL DEFAULT '{}'::jsonb,
  new_values jsonb NOT NULL DEFAULT '{}'::jsonb,
  source text,
  request_id text,
  moderation_impact boolean NOT NULL DEFAULT false
);

GRANT SELECT ON public.post_edits_audit TO authenticated;
GRANT ALL ON public.post_edits_audit TO service_role;

ALTER TABLE public.post_edits_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "post_edits_audit_admin_read"
  ON public.post_edits_audit FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator'));

-- No insert/update/delete policies => only service_role / SECURITY DEFINER triggers can write.

CREATE INDEX IF NOT EXISTS idx_post_edits_audit_post ON public.post_edits_audit(post_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_post_edits_audit_editor ON public.post_edits_audit(editor_user_id, created_at DESC);

-- Trigger: capture edits to safety-relevant fields
CREATE OR REPLACE FUNCTION public.posts_write_edit_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_changed text[] := '{}';
  v_prev jsonb := '{}'::jsonb;
  v_new  jsonb := '{}'::jsonb;
  v_mod_impact boolean := false;
BEGIN
  IF NEW.caption IS DISTINCT FROM OLD.caption THEN
    v_changed := v_changed || 'caption';
    v_prev := v_prev || jsonb_build_object('caption', OLD.caption);
    v_new  := v_new  || jsonb_build_object('caption', NEW.caption);
    v_mod_impact := true;
  END IF;
  IF NEW.image_url IS DISTINCT FROM OLD.image_url THEN
    v_changed := v_changed || 'image_url';
    v_prev := v_prev || jsonb_build_object('image_url', OLD.image_url);
    v_new  := v_new  || jsonb_build_object('image_url', NEW.image_url);
    v_mod_impact := true;
  END IF;
  IF NEW.image_urls IS DISTINCT FROM OLD.image_urls THEN
    v_changed := v_changed || 'image_urls';
    v_mod_impact := true;
  END IF;
  IF NEW.category IS DISTINCT FROM OLD.category THEN
    v_changed := v_changed || 'category';
    v_prev := v_prev || jsonb_build_object('category', OLD.category);
    v_new  := v_new  || jsonb_build_object('category', NEW.category);
    v_mod_impact := true;
  END IF;
  IF NEW.main_category_slug IS DISTINCT FROM OLD.main_category_slug
     OR NEW.subcategory_slug IS DISTINCT FROM OLD.subcategory_slug THEN
    v_changed := v_changed || 'taxonomy';
    v_mod_impact := true;
  END IF;
  IF NEW.is_sensitive IS DISTINCT FROM OLD.is_sensitive
     OR NEW.content_rating IS DISTINCT FROM OLD.content_rating THEN
    v_changed := v_changed || 'sensitive';
    v_mod_impact := true;
  END IF;
  IF NEW.filter IS DISTINCT FROM OLD.filter THEN
    v_changed := v_changed || 'filter';
  END IF;
  IF NEW.alt_texts IS DISTINCT FROM OLD.alt_texts THEN
    v_changed := v_changed || 'alt_texts';
  END IF;
  IF NEW.city IS DISTINCT FROM OLD.city
     OR NEW.state IS DISTINCT FROM OLD.state
     OR NEW.country IS DISTINCT FROM OLD.country THEN
    v_changed := v_changed || 'location';
  END IF;

  IF array_length(v_changed,1) IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.post_edits_audit (
    post_id, editor_user_id, changed_fields, previous_values, new_values,
    source, moderation_impact
  ) VALUES (
    NEW.id,
    COALESCE(auth.uid(), NEW.user_id),
    v_changed, v_prev, v_new,
    'posts_update_trigger',
    v_mod_impact
  );

  -- If a safety-relevant field changed by the owner, push back to pending_review.
  IF v_mod_impact
     AND auth.uid() = NEW.user_id
     AND NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator')) THEN
    NEW.publish_status := 'pending_review';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_posts_write_edit_audit ON public.posts;
CREATE TRIGGER trg_posts_write_edit_audit
  BEFORE UPDATE ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.posts_write_edit_audit();

-- ============================================================
-- 5. Orphaned media cleanup (caller-scoped)
-- ============================================================
CREATE OR REPLACE FUNCTION public.cleanup_orphaned_media(p_older_than_minutes int DEFAULT 60)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_deleted int := 0;
  r record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  FOR r IN
    SELECT o.name
      FROM storage.objects o
      WHERE o.bucket_id = 'media'
        AND o.owner = v_uid
        AND o.name LIKE v_uid::text || '/%'
        AND o.created_at < now() - make_interval(mins => p_older_than_minutes)
        AND NOT EXISTS (
          SELECT 1 FROM public.posts p
          WHERE p.user_id = v_uid
            AND (
              p.image_url LIKE '%' || o.name
              OR EXISTS (SELECT 1 FROM unnest(p.image_urls) u WHERE u LIKE '%' || o.name)
              OR p.video_url LIKE '%' || o.name
              OR p.video_poster_url LIKE '%' || o.name
            )
        )
  LOOP
    DELETE FROM storage.objects WHERE bucket_id='media' AND name = r.name;
    v_deleted := v_deleted + 1;
  END LOOP;

  RETURN v_deleted;
END $$;

GRANT EXECUTE ON FUNCTION public.cleanup_orphaned_media(int) TO authenticated;

-- ============================================================
-- 6. Profile change rate limit helper
-- ============================================================
CREATE TABLE IF NOT EXISTS public.profile_change_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  change_type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.profile_change_log TO authenticated;
GRANT ALL ON public.profile_change_log TO service_role;

ALTER TABLE public.profile_change_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profile_change_log_owner_read"
  ON public.profile_change_log FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "profile_change_log_owner_insert"
  ON public.profile_change_log FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_profile_change_log_user_type_time
  ON public.profile_change_log (user_id, change_type, created_at DESC);

CREATE OR REPLACE FUNCTION public.profile_change_allowed(
  p_change_type text, p_max_per_hour int DEFAULT 5
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*) < p_max_per_hour
    FROM public.profile_change_log
    WHERE user_id = auth.uid()
      AND change_type = p_change_type
      AND created_at > now() - interval '1 hour';
$$;

GRANT EXECUTE ON FUNCTION public.profile_change_allowed(text, int) TO authenticated;
