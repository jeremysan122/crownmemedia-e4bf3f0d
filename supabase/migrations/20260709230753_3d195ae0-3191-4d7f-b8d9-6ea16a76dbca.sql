
-- 1. BEFORE UPDATE trigger blocking non-admin edits to protected columns.
CREATE OR REPLACE FUNCTION public.posts_guard_protected_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_privileged boolean;
BEGIN
  -- service_role (edge functions, cron jobs) bypasses the guard.
  IF current_setting('request.jwt.claim.role', true) = 'service_role'
     OR current_setting('role', true) = 'service_role' THEN
    RETURN NEW;
  END IF;

  v_is_privileged := (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'moderator'::app_role)
  );

  IF v_is_privileged THEN
    RETURN NEW;
  END IF;

  -- Ranking / server-maintained counters
  IF NEW.crown_score      IS DISTINCT FROM OLD.crown_score      THEN RAISE EXCEPTION 'crown_score is server-controlled' USING ERRCODE='42501'; END IF;
  IF NEW.vote_count       IS DISTINCT FROM OLD.vote_count       THEN RAISE EXCEPTION 'vote_count is server-controlled' USING ERRCODE='42501'; END IF;
  IF NEW.comment_count    IS DISTINCT FROM OLD.comment_count    THEN RAISE EXCEPTION 'comment_count is server-controlled' USING ERRCODE='42501'; END IF;
  IF NEW.share_count      IS DISTINCT FROM OLD.share_count      THEN RAISE EXCEPTION 'share_count is server-controlled' USING ERRCODE='42501'; END IF;
  IF NEW.repost_count     IS DISTINCT FROM OLD.repost_count     THEN RAISE EXCEPTION 'repost_count is server-controlled' USING ERRCODE='42501'; END IF;
  IF NEW.battle_wins      IS DISTINCT FROM OLD.battle_wins      THEN RAISE EXCEPTION 'battle_wins is server-controlled' USING ERRCODE='42501'; END IF;

  -- Moderation / removal / archive / publish state
  IF NEW.moderation_status IS DISTINCT FROM OLD.moderation_status THEN RAISE EXCEPTION 'moderation_status is admin-only' USING ERRCODE='42501'; END IF;
  IF NEW.moderation_notes  IS DISTINCT FROM OLD.moderation_notes  THEN RAISE EXCEPTION 'moderation_notes is admin-only' USING ERRCODE='42501'; END IF;
  IF NEW.moderated_by      IS DISTINCT FROM OLD.moderated_by      THEN RAISE EXCEPTION 'moderated_by is admin-only' USING ERRCODE='42501'; END IF;
  IF NEW.moderated_at      IS DISTINCT FROM OLD.moderated_at      THEN RAISE EXCEPTION 'moderated_at is admin-only' USING ERRCODE='42501'; END IF;
  IF NEW.is_removed        IS DISTINCT FROM OLD.is_removed        THEN RAISE EXCEPTION 'is_removed is admin-only' USING ERRCODE='42501'; END IF;
  IF NEW.publish_status    IS DISTINCT FROM OLD.publish_status    THEN RAISE EXCEPTION 'publish_status is admin-only' USING ERRCODE='42501'; END IF;
  IF NEW.sensitive_reason  IS DISTINCT FROM OLD.sensitive_reason  THEN RAISE EXCEPTION 'sensitive_reason is admin-only' USING ERRCODE='42501'; END IF;
  IF NEW.content_rating    IS DISTINCT FROM OLD.content_rating    THEN RAISE EXCEPTION 'content_rating is admin-only' USING ERRCODE='42501'; END IF;
  IF NEW.is_sensitive      IS DISTINCT FROM OLD.is_sensitive      THEN RAISE EXCEPTION 'is_sensitive is admin-only' USING ERRCODE='42501'; END IF;

  -- Ingest / audit keys
  IF NEW.submission_key    IS DISTINCT FROM OLD.submission_key    THEN RAISE EXCEPTION 'submission_key is server-controlled' USING ERRCODE='42501'; END IF;
  IF NEW.client_request_id IS DISTINCT FROM OLD.client_request_id THEN RAISE EXCEPTION 'client_request_id is server-controlled' USING ERRCODE='42501'; END IF;

  -- Boost timers (paid/system placements)
  IF NEW.crown_shield_until IS DISTINCT FROM OLD.crown_shield_until THEN RAISE EXCEPTION 'crown_shield_until is server-controlled' USING ERRCODE='42501'; END IF;
  IF NEW.royal_boost_until  IS DISTINCT FROM OLD.royal_boost_until  THEN RAISE EXCEPTION 'royal_boost_until is server-controlled' USING ERRCODE='42501'; END IF;
  IF NEW.spotlight_until    IS DISTINCT FROM OLD.spotlight_until    THEN RAISE EXCEPTION 'spotlight_until is server-controlled' USING ERRCODE='42501'; END IF;
  IF NEW.vote_boost_until   IS DISTINCT FROM OLD.vote_boost_until   THEN RAISE EXCEPTION 'vote_boost_until is server-controlled' USING ERRCODE='42501'; END IF;

  -- AI / internal analysis fields
  IF NEW.ai_searchable_text              IS DISTINCT FROM OLD.ai_searchable_text              THEN RAISE EXCEPTION 'ai_searchable_text is server-controlled' USING ERRCODE='42501'; END IF;
  IF NEW.ai_suggested_main_category_slug IS DISTINCT FROM OLD.ai_suggested_main_category_slug THEN RAISE EXCEPTION 'ai_suggested_main_category_slug is server-controlled' USING ERRCODE='42501'; END IF;

  -- Immutable identity + category (owner may not re-slot a post)
  IF NEW.user_id            IS DISTINCT FROM OLD.user_id            THEN RAISE EXCEPTION 'user_id is immutable' USING ERRCODE='42501'; END IF;
  IF NEW.parent_post_id     IS DISTINCT FROM OLD.parent_post_id     THEN RAISE EXCEPTION 'parent_post_id is immutable' USING ERRCODE='42501'; END IF;
  IF NEW.category           IS DISTINCT FROM OLD.category           THEN RAISE EXCEPTION 'category is immutable' USING ERRCODE='42501'; END IF;
  IF NEW.main_category_slug IS DISTINCT FROM OLD.main_category_slug THEN RAISE EXCEPTION 'main_category_slug is immutable' USING ERRCODE='42501'; END IF;
  IF NEW.subcategory_slug   IS DISTINCT FROM OLD.subcategory_slug   THEN RAISE EXCEPTION 'subcategory_slug is immutable' USING ERRCODE='42501'; END IF;
  IF NEW.content_type       IS DISTINCT FROM OLD.content_type       THEN RAISE EXCEPTION 'content_type is immutable' USING ERRCODE='42501'; END IF;

  -- Owners MAY still flip is_archived (archive/unarchive their own post).
  -- Everything not enumerated above is either owner-editable (caption,
  -- hashtags, tagged_user_ids, alt_texts, filters, allowed location
  -- display fields, edited_at, pinned_at, scheduled_for, repost_caption)
  -- or handled by the immutable list above.

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.posts_guard_protected_fields() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_posts_guard_protected_fields ON public.posts;
CREATE TRIGGER trg_posts_guard_protected_fields
BEFORE UPDATE ON public.posts
FOR EACH ROW EXECUTE FUNCTION public.posts_guard_protected_fields();

-- 2. Restrictive UPDATE policy — belt-and-braces so no future permissive
--    policy can accidentally re-open owner writes to admin-only fields.
DROP POLICY IF EXISTS "Posts: deny mutation of protected fields" ON public.posts;
CREATE POLICY "Posts: deny mutation of protected fields"
ON public.posts
AS RESTRICTIVE
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'moderator'::app_role)
  OR auth.uid() = user_id
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'moderator'::app_role)
  OR auth.uid() = user_id
);

-- 3. Admin RPC for moderating a post through an approved path.
CREATE OR REPLACE FUNCTION public.admin_moderate_post(
  _post_id uuid,
  _moderation_status text,
  _is_removed boolean DEFAULT NULL,
  _content_rating text DEFAULT NULL,
  _sensitive_reason text DEFAULT NULL,
  _moderation_notes text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'moderator'::app_role)
  ) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  UPDATE public.posts
     SET moderation_status = _moderation_status::moderation_status,
         moderation_notes  = COALESCE(_moderation_notes, moderation_notes),
         moderated_by      = auth.uid(),
         moderated_at      = now(),
         is_removed        = COALESCE(_is_removed, is_removed),
         content_rating    = COALESCE(_content_rating::content_rating, content_rating),
         sensitive_reason  = COALESCE(_sensitive_reason, sensitive_reason)
   WHERE id = _post_id;

  INSERT INTO public.admin_audit_log (actor_id, action, target_type, target_id, metadata)
  VALUES (
    auth.uid(),
    'post.moderate',
    'post',
    _post_id,
    jsonb_build_object(
      'moderation_status', _moderation_status,
      'is_removed', _is_removed,
      'content_rating', _content_rating
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_moderate_post(uuid, text, boolean, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_moderate_post(uuid, text, boolean, text, text, text) TO authenticated, service_role;
