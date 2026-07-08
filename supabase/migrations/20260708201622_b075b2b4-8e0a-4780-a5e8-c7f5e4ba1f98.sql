
-- ========================================================================
-- PART A: posts.repost_count column + backfill
-- ========================================================================
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS repost_count integer NOT NULL DEFAULT 0
  CHECK (repost_count >= 0);

-- Backfill: count active repost shells per original
WITH counts AS (
  SELECT parent_post_id AS pid, COUNT(*)::int AS c
  FROM public.posts
  WHERE parent_post_id IS NOT NULL
    AND is_removed = false
    AND is_archived = false
  GROUP BY parent_post_id
)
UPDATE public.posts p
   SET repost_count = c.c
  FROM counts c
 WHERE p.id = c.pid;

-- ========================================================================
-- PART B: posts protected-column guard trigger (defense in depth)
-- ========================================================================
CREATE OR REPLACE FUNCTION public.posts_prevent_protected_column_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_privileged boolean := false;
BEGIN
  -- service_role bypasses (background jobs, webhooks, RPCs)
  IF current_setting('role', true) = 'service_role' THEN
    RETURN NEW;
  END IF;

  BEGIN
    is_privileged := public.has_role(auth.uid(), 'admin'::app_role)
                  OR public.has_role(auth.uid(), 'moderator'::app_role);
  EXCEPTION WHEN others THEN
    is_privileged := false;
  END;

  -- Immutable for EVERYONE except service_role
  IF NEW.id           IS DISTINCT FROM OLD.id
  OR NEW.user_id      IS DISTINCT FROM OLD.user_id
  OR NEW.created_at   IS DISTINCT FROM OLD.created_at
  OR NEW.submission_key    IS DISTINCT FROM OLD.submission_key
  OR NEW.client_request_id IS DISTINCT FROM OLD.client_request_id
  OR NEW.parent_post_id    IS DISTINCT FROM OLD.parent_post_id
  THEN
    RAISE EXCEPTION 'Cannot modify immutable post field'
      USING ERRCODE = '42501';
  END IF;

  IF is_privileged THEN
    RETURN NEW;
  END IF;

  -- Non-admin / non-moderator: block ranking, moderation, boost, counter fields
  IF NEW.crown_score          IS DISTINCT FROM OLD.crown_score
  OR NEW.vote_count           IS DISTINCT FROM OLD.vote_count
  OR NEW.comment_count        IS DISTINCT FROM OLD.comment_count
  OR NEW.share_count          IS DISTINCT FROM OLD.share_count
  OR NEW.repost_count         IS DISTINCT FROM OLD.repost_count
  OR NEW.battle_wins          IS DISTINCT FROM OLD.battle_wins
  OR NEW.moderation_status    IS DISTINCT FROM OLD.moderation_status
  OR NEW.moderation_notes     IS DISTINCT FROM OLD.moderation_notes
  OR NEW.moderated_by         IS DISTINCT FROM OLD.moderated_by
  OR NEW.moderated_at         IS DISTINCT FROM OLD.moderated_at
  OR NEW.is_removed           IS DISTINCT FROM OLD.is_removed
  OR NEW.is_sensitive         IS DISTINCT FROM OLD.is_sensitive
  OR NEW.sensitive_reason     IS DISTINCT FROM OLD.sensitive_reason
  OR NEW.content_rating       IS DISTINCT FROM OLD.content_rating
  OR NEW.royal_boost_until    IS DISTINCT FROM OLD.royal_boost_until
  OR NEW.vote_boost_until     IS DISTINCT FROM OLD.vote_boost_until
  OR NEW.spotlight_until      IS DISTINCT FROM OLD.spotlight_until
  OR NEW.crown_shield_until   IS DISTINCT FROM OLD.crown_shield_until
  OR NEW.publish_status       IS DISTINCT FROM OLD.publish_status
  OR NEW.main_category_slug   IS DISTINCT FROM OLD.main_category_slug
  OR NEW.subcategory_slug     IS DISTINCT FROM OLD.subcategory_slug
  OR NEW.ai_searchable_text   IS DISTINCT FROM OLD.ai_searchable_text
  OR NEW.ai_suggested_main_category_slug IS DISTINCT FROM OLD.ai_suggested_main_category_slug
  OR NEW.scheduled_for        IS DISTINCT FROM OLD.scheduled_for
  THEN
    RAISE EXCEPTION 'Not permitted to modify protected post field'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS posts_prevent_protected_column_changes ON public.posts;
CREATE TRIGGER posts_prevent_protected_column_changes
  BEFORE UPDATE ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.posts_prevent_protected_column_changes();

-- ========================================================================
-- PART C: posts column-level UPDATE grants (belt-and-suspenders + scanner)
-- ========================================================================
REVOKE UPDATE ON public.posts FROM authenticated;
GRANT UPDATE (
  -- owner-safe content
  caption, hashtags, alt_texts,
  filter, photo_filter, video_filter, filter_type,
  -- location
  location_enabled, location_source, location_label,
  city, state, country, region_name, region_type,
  post_lat, post_lng, post_location_precision, location_captured_at,
  -- owner lifecycle
  edited_at, is_archived, archived_at, pinned_at, repost_caption,
  -- admin/mod-writable (trigger enforces role gating)
  is_removed, moderation_status, moderation_notes, moderated_by, moderated_at,
  is_sensitive, sensitive_reason, content_rating,
  crown_score, vote_count, comment_count, share_count, repost_count, battle_wins,
  royal_boost_until, vote_boost_until, spotlight_until, crown_shield_until,
  publish_status, main_category_slug, subcategory_slug,
  ai_searchable_text, ai_suggested_main_category_slug, scheduled_for
) ON public.posts TO authenticated;

-- ========================================================================
-- PART D: repost_count maintenance trigger
-- ========================================================================
CREATE OR REPLACE FUNCTION public.posts_maintain_repost_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  was_active boolean;
  is_active  boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.parent_post_id IS NOT NULL
       AND NEW.is_removed = false
       AND NEW.is_archived = false
    THEN
      UPDATE public.posts
         SET repost_count = repost_count + 1
       WHERE id = NEW.parent_post_id;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.parent_post_id IS NULL AND OLD.parent_post_id IS NULL THEN
      RETURN NEW;
    END IF;
    -- parent_post_id is immutable (guard trigger), so treat both sides equal
    was_active := (OLD.parent_post_id IS NOT NULL
                   AND OLD.is_removed = false
                   AND OLD.is_archived = false);
    is_active  := (NEW.parent_post_id IS NOT NULL
                   AND NEW.is_removed = false
                   AND NEW.is_archived = false);
    IF was_active AND NOT is_active THEN
      UPDATE public.posts
         SET repost_count = GREATEST(0, repost_count - 1)
       WHERE id = OLD.parent_post_id;
    ELSIF NOT was_active AND is_active THEN
      UPDATE public.posts
         SET repost_count = repost_count + 1
       WHERE id = NEW.parent_post_id;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.parent_post_id IS NOT NULL
       AND OLD.is_removed = false
       AND OLD.is_archived = false
    THEN
      UPDATE public.posts
         SET repost_count = GREATEST(0, repost_count - 1)
       WHERE id = OLD.parent_post_id;
    END IF;
    RETURN OLD;
  END IF;

  RETURN NULL;
END
$$;

DROP TRIGGER IF EXISTS posts_maintain_repost_count ON public.posts;
CREATE TRIGGER posts_maintain_repost_count
  AFTER INSERT OR UPDATE OF is_removed, is_archived OR DELETE
  ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.posts_maintain_repost_count();

-- Repair helpers (admin/service_role only)
CREATE OR REPLACE FUNCTION public.recalculate_repost_count(_post_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_count integer;
BEGIN
  IF NOT (current_setting('role', true) = 'service_role'
          OR public.has_role(auth.uid(), 'admin'::app_role)) THEN
    RAISE EXCEPTION 'Admin role required' USING ERRCODE = '42501';
  END IF;
  SELECT COUNT(*)::int INTO v_count
    FROM public.posts
   WHERE parent_post_id = _post_id
     AND is_removed = false
     AND is_archived = false;
  UPDATE public.posts SET repost_count = v_count WHERE id = _post_id;
  RETURN v_count;
END
$$;
REVOKE ALL ON FUNCTION public.recalculate_repost_count(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recalculate_repost_count(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.recalculate_all_repost_counts()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_rows integer;
BEGIN
  IF NOT (current_setting('role', true) = 'service_role'
          OR public.has_role(auth.uid(), 'admin'::app_role)) THEN
    RAISE EXCEPTION 'Admin role required' USING ERRCODE = '42501';
  END IF;
  WITH counts AS (
    SELECT parent_post_id AS pid, COUNT(*)::int AS c
      FROM public.posts
     WHERE parent_post_id IS NOT NULL
       AND is_removed = false
       AND is_archived = false
     GROUP BY parent_post_id
  )
  UPDATE public.posts p
     SET repost_count = COALESCE(c.c, 0)
    FROM (
      SELECT id, (SELECT c FROM counts WHERE pid = posts.id) AS c
        FROM public.posts
    ) c
   WHERE p.id = c.id
     AND p.repost_count IS DISTINCT FROM COALESCE(c.c, 0);
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END
$$;
REVOKE ALL ON FUNCTION public.recalculate_all_repost_counts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recalculate_all_repost_counts() TO authenticated, service_role;

-- ========================================================================
-- PART E: comments lockdown
-- ========================================================================
CREATE OR REPLACE FUNCTION public.comments_prevent_protected_column_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_privileged boolean := false;
BEGIN
  IF current_setting('role', true) = 'service_role' THEN
    RETURN NEW;
  END IF;

  BEGIN
    is_privileged := public.has_role(auth.uid(), 'admin'::app_role)
                  OR public.has_role(auth.uid(), 'moderator'::app_role);
  EXCEPTION WHEN others THEN
    is_privileged := false;
  END;

  -- Immutable for everyone except service_role
  IF NEW.id         IS DISTINCT FROM OLD.id
  OR NEW.user_id    IS DISTINCT FROM OLD.user_id
  OR NEW.post_id    IS DISTINCT FROM OLD.post_id
  OR NEW.parent_id  IS DISTINCT FROM OLD.parent_id
  OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'Cannot modify immutable comment field' USING ERRCODE = '42501';
  END IF;

  IF is_privileged THEN
    RETURN NEW;
  END IF;

  IF NEW.is_removed       IS DISTINCT FROM OLD.is_removed
  OR NEW.reply_count      IS DISTINCT FROM OLD.reply_count
  OR NEW.mention_user_ids IS DISTINCT FROM OLD.mention_user_ids
  THEN
    RAISE EXCEPTION 'Not permitted to modify protected comment field' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS comments_prevent_protected_column_changes ON public.comments;
CREATE TRIGGER comments_prevent_protected_column_changes
  BEFORE UPDATE ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.comments_prevent_protected_column_changes();

REVOKE UPDATE ON public.comments FROM authenticated;
GRANT UPDATE (
  body, edited_at,
  -- admin/mod-writable, trigger enforces
  is_removed, reply_count, mention_user_ids
) ON public.comments TO authenticated;
