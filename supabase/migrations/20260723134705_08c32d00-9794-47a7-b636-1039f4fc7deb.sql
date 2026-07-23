-- The vote insert path triggers votes_recalc -> recalc_post_score, which
-- issues an UPDATE on public.posts to set crown_score, vote_count, and
-- comment_count. Both guard triggers (posts_prevent_protected_column_changes
-- and posts_guard_protected_fields) then raise 42501 because the calling
-- user is not admin/moderator, even though the change originated from a
-- server-side recalc rather than user input. posts_guard_owner_updates
-- already uses pg_trigger_depth() > 1 to bypass in this exact case; apply
-- the same rule to the other two guards. Direct user UPDATE remains
-- blocked because pg_trigger_depth() = 1 at the top level.

CREATE OR REPLACE FUNCTION public.posts_prevent_protected_column_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  is_privileged boolean := false;
  boost_sync boolean := (current_setting('lovable.boost_sync', true) = '1');
BEGIN
  IF current_setting('role', true) = 'service_role' THEN RETURN NEW; END IF;

  -- Immutable columns are enforced at every depth to prevent identity swaps
  -- from nested triggers or RPCs.
  IF NEW.id           IS DISTINCT FROM OLD.id
  OR NEW.user_id      IS DISTINCT FROM OLD.user_id
  OR NEW.created_at   IS DISTINCT FROM OLD.created_at
  OR NEW.submission_key    IS DISTINCT FROM OLD.submission_key
  OR NEW.client_request_id IS DISTINCT FROM OLD.client_request_id
  OR NEW.parent_post_id    IS DISTINCT FROM OLD.parent_post_id THEN
    RAISE EXCEPTION 'Cannot modify immutable post field' USING ERRCODE = '42501';
  END IF;

  -- Nested trigger (votes_recalc, share recalc, boost expiry, etc.) is
  -- server-controlled and is the only sanctioned way for aggregate columns
  -- to change. Allow it through without further checks.
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  IF boost_sync THEN
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
    OR NEW.publish_status       IS DISTINCT FROM OLD.publish_status
    OR NEW.main_category_slug   IS DISTINCT FROM OLD.main_category_slug
    OR NEW.subcategory_slug     IS DISTINCT FROM OLD.subcategory_slug
    OR NEW.ai_searchable_text   IS DISTINCT FROM OLD.ai_searchable_text
    OR NEW.ai_suggested_main_category_slug IS DISTINCT FROM OLD.ai_suggested_main_category_slug
    OR NEW.scheduled_for        IS DISTINCT FROM OLD.scheduled_for THEN
      RAISE EXCEPTION 'boost-sync path may only alter boost expiry columns' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  BEGIN
    is_privileged := public.has_role(auth.uid(), 'admin'::app_role)
                  OR public.has_role(auth.uid(), 'moderator'::app_role);
  EXCEPTION WHEN others THEN is_privileged := false; END;
  IF is_privileged THEN RETURN NEW; END IF;

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
  OR NEW.scheduled_for        IS DISTINCT FROM OLD.scheduled_for THEN
    RAISE EXCEPTION 'Not permitted to modify protected post field' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.posts_guard_protected_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_is_privileged boolean;
  boost_sync boolean := (current_setting('lovable.boost_sync', true) = '1');
BEGIN
  IF current_setting('request.jwt.claim.role', true) = 'service_role'
     OR current_setting('role', true) = 'service_role' THEN RETURN NEW; END IF;

  -- Server-side recalc/aggregate triggers run at depth > 1 and are trusted.
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;

  IF boost_sync THEN
    IF NEW.user_id IS DISTINCT FROM OLD.user_id
    OR NEW.parent_post_id IS DISTINCT FROM OLD.parent_post_id
    OR NEW.category IS DISTINCT FROM OLD.category
    OR NEW.main_category_slug IS DISTINCT FROM OLD.main_category_slug
    OR NEW.subcategory_slug IS DISTINCT FROM OLD.subcategory_slug
    OR NEW.content_type IS DISTINCT FROM OLD.content_type
    OR NEW.crown_score IS DISTINCT FROM OLD.crown_score
    OR NEW.vote_count IS DISTINCT FROM OLD.vote_count
    OR NEW.moderation_status IS DISTINCT FROM OLD.moderation_status
    OR NEW.is_removed IS DISTINCT FROM OLD.is_removed
    OR NEW.publish_status IS DISTINCT FROM OLD.publish_status
    OR NEW.is_sensitive IS DISTINCT FROM OLD.is_sensitive
    THEN RAISE EXCEPTION 'boost-sync path may only alter boost expiry columns' USING ERRCODE='42501';
    END IF;
    RETURN NEW;
  END IF;

  v_is_privileged := (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'moderator'::app_role));
  IF v_is_privileged THEN RETURN NEW; END IF;

  IF NEW.crown_score      IS DISTINCT FROM OLD.crown_score      THEN RAISE EXCEPTION 'crown_score is server-controlled' USING ERRCODE='42501'; END IF;
  IF NEW.vote_count       IS DISTINCT FROM OLD.vote_count       THEN RAISE EXCEPTION 'vote_count is server-controlled' USING ERRCODE='42501'; END IF;
  IF NEW.comment_count    IS DISTINCT FROM OLD.comment_count    THEN RAISE EXCEPTION 'comment_count is server-controlled' USING ERRCODE='42501'; END IF;
  IF NEW.share_count      IS DISTINCT FROM OLD.share_count      THEN RAISE EXCEPTION 'share_count is server-controlled' USING ERRCODE='42501'; END IF;
  IF NEW.repost_count     IS DISTINCT FROM OLD.repost_count     THEN RAISE EXCEPTION 'repost_count is server-controlled' USING ERRCODE='42501'; END IF;
  IF NEW.battle_wins      IS DISTINCT FROM OLD.battle_wins      THEN RAISE EXCEPTION 'battle_wins is server-controlled' USING ERRCODE='42501'; END IF;
  IF NEW.moderation_status IS DISTINCT FROM OLD.moderation_status THEN RAISE EXCEPTION 'moderation_status is admin-only' USING ERRCODE='42501'; END IF;
  IF NEW.is_removed       IS DISTINCT FROM OLD.is_removed       THEN RAISE EXCEPTION 'is_removed is admin-only' USING ERRCODE='42501'; END IF;

  RETURN NEW;
END;
$function$;