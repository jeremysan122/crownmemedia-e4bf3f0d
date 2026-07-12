
CREATE OR REPLACE FUNCTION public.trg_sync_boost_to_post()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_col text; BEGIN
  IF NEW.post_id IS NULL OR NOT NEW.active OR NEW.expires_at IS NULL THEN RETURN NEW; END IF;
  v_col := CASE NEW.boost_type::text
    WHEN 'royal_boost'     THEN 'royal_boost_until'
    WHEN 'vote_boost'      THEN 'vote_boost_until'
    WHEN 'crown_spotlight' THEN 'spotlight_until'
    WHEN 'crown_shield'    THEN 'crown_shield_until'
    ELSE NULL END;
  IF v_col IS NULL THEN RETURN NEW; END IF;
  PERFORM set_config('lovable.boost_sync', '1', true);
  BEGIN
    EXECUTE format(
      'UPDATE public.posts SET %I = GREATEST(COALESCE(%I, ''epoch''::timestamptz), $1) WHERE id = $2',
      v_col, v_col) USING NEW.expires_at, NEW.post_id;
  EXCEPTION WHEN others THEN
    PERFORM set_config('lovable.boost_sync', '0', true);
    RAISE;
  END;
  PERFORM set_config('lovable.boost_sync', '0', true);
  IF NEW.boost_type::text = 'royal_boost' THEN PERFORM public.recalc_post_score(NEW.post_id); END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.posts_prevent_protected_column_changes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  is_privileged boolean := false;
  boost_sync boolean := (current_setting('lovable.boost_sync', true) = '1');
BEGIN
  IF current_setting('role', true) = 'service_role' THEN RETURN NEW; END IF;

  IF NEW.id           IS DISTINCT FROM OLD.id
  OR NEW.user_id      IS DISTINCT FROM OLD.user_id
  OR NEW.created_at   IS DISTINCT FROM OLD.created_at
  OR NEW.submission_key    IS DISTINCT FROM OLD.submission_key
  OR NEW.client_request_id IS DISTINCT FROM OLD.client_request_id
  OR NEW.parent_post_id    IS DISTINCT FROM OLD.parent_post_id THEN
    RAISE EXCEPTION 'Cannot modify immutable post field' USING ERRCODE = '42501';
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
