
CREATE OR REPLACE FUNCTION public.posts_guard_protected_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_is_privileged boolean;
  boost_sync boolean := (current_setting('lovable.boost_sync', true) = '1');
BEGIN
  IF current_setting('request.jwt.claim.role', true) = 'service_role'
     OR current_setting('role', true) = 'service_role' THEN RETURN NEW; END IF;

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
  IF NEW.moderation_notes  IS DISTINCT FROM OLD.moderation_notes  THEN RAISE EXCEPTION 'moderation_notes is admin-only' USING ERRCODE='42501'; END IF;
  IF NEW.moderated_by      IS DISTINCT FROM OLD.moderated_by      THEN RAISE EXCEPTION 'moderated_by is admin-only' USING ERRCODE='42501'; END IF;
  IF NEW.moderated_at      IS DISTINCT FROM OLD.moderated_at      THEN RAISE EXCEPTION 'moderated_at is admin-only' USING ERRCODE='42501'; END IF;
  IF NEW.is_removed        IS DISTINCT FROM OLD.is_removed        THEN RAISE EXCEPTION 'is_removed is admin-only' USING ERRCODE='42501'; END IF;
  IF NEW.publish_status    IS DISTINCT FROM OLD.publish_status    THEN RAISE EXCEPTION 'publish_status is admin-only' USING ERRCODE='42501'; END IF;
  IF NEW.sensitive_reason  IS DISTINCT FROM OLD.sensitive_reason  THEN RAISE EXCEPTION 'sensitive_reason is admin-only' USING ERRCODE='42501'; END IF;
  IF NEW.content_rating    IS DISTINCT FROM OLD.content_rating    THEN RAISE EXCEPTION 'content_rating is admin-only' USING ERRCODE='42501'; END IF;
  IF NEW.is_sensitive      IS DISTINCT FROM OLD.is_sensitive      THEN RAISE EXCEPTION 'is_sensitive is admin-only' USING ERRCODE='42501'; END IF;
  IF NEW.submission_key    IS DISTINCT FROM OLD.submission_key    THEN RAISE EXCEPTION 'submission_key is server-controlled' USING ERRCODE='42501'; END IF;
  IF NEW.client_request_id IS DISTINCT FROM OLD.client_request_id THEN RAISE EXCEPTION 'client_request_id is server-controlled' USING ERRCODE='42501'; END IF;
  IF NEW.royal_boost_until  IS DISTINCT FROM OLD.royal_boost_until  THEN RAISE EXCEPTION 'royal_boost_until is server-controlled' USING ERRCODE='42501'; END IF;
  IF NEW.vote_boost_until   IS DISTINCT FROM OLD.vote_boost_until   THEN RAISE EXCEPTION 'vote_boost_until is server-controlled' USING ERRCODE='42501'; END IF;
  IF NEW.spotlight_until    IS DISTINCT FROM OLD.spotlight_until    THEN RAISE EXCEPTION 'spotlight_until is server-controlled' USING ERRCODE='42501'; END IF;
  IF NEW.crown_shield_until IS DISTINCT FROM OLD.crown_shield_until THEN RAISE EXCEPTION 'crown_shield_until is server-controlled' USING ERRCODE='42501'; END IF;
  IF NEW.user_id            IS DISTINCT FROM OLD.user_id            THEN RAISE EXCEPTION 'user_id is immutable' USING ERRCODE='42501'; END IF;
  IF NEW.parent_post_id     IS DISTINCT FROM OLD.parent_post_id     THEN RAISE EXCEPTION 'parent_post_id is immutable' USING ERRCODE='42501'; END IF;
  IF NEW.category           IS DISTINCT FROM OLD.category           THEN RAISE EXCEPTION 'category is immutable' USING ERRCODE='42501'; END IF;
  IF NEW.main_category_slug IS DISTINCT FROM OLD.main_category_slug THEN RAISE EXCEPTION 'main_category_slug is immutable' USING ERRCODE='42501'; END IF;
  IF NEW.subcategory_slug   IS DISTINCT FROM OLD.subcategory_slug   THEN RAISE EXCEPTION 'subcategory_slug is immutable' USING ERRCODE='42501'; END IF;
  IF NEW.content_type       IS DISTINCT FROM OLD.content_type       THEN RAISE EXCEPTION 'content_type is immutable' USING ERRCODE='42501'; END IF;
  RETURN NEW;
END; $function$;
