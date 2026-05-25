CREATE OR REPLACE FUNCTION public.posts_guard_owner_updates()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Allow service role, admins, moderators, and any non-user-context update
  IF auth.uid() IS NULL
     OR public.has_role(auth.uid(), 'admin'::app_role)
     OR public.has_role(auth.uid(), 'moderator'::app_role) THEN
    RETURN NEW;
  END IF;

  -- Allow nested updates triggered by other triggers (vote/comment/share recalcs)
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  -- Only enforce field restrictions when the OWNER themselves is editing.
  IF auth.uid() <> OLD.user_id THEN
    RETURN NEW;
  END IF;

  IF NEW.crown_score IS DISTINCT FROM OLD.crown_score
     OR NEW.vote_count IS DISTINCT FROM OLD.vote_count
     OR NEW.comment_count IS DISTINCT FROM OLD.comment_count
     OR NEW.share_count IS DISTINCT FROM OLD.share_count
     OR NEW.battle_wins IS DISTINCT FROM OLD.battle_wins
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.media_type IS DISTINCT FROM OLD.media_type
     OR NEW.video_url IS DISTINCT FROM OLD.video_url
     OR NEW.duration_ms IS DISTINCT FROM OLD.duration_ms
  THEN
    RAISE EXCEPTION 'Users cannot modify protected post fields';
  END IF;

  IF NEW.category IS DISTINCT FROM OLD.category
     OR NEW.city IS DISTINCT FROM OLD.city
     OR NEW.state IS DISTINCT FROM OLD.state
     OR NEW.country IS DISTINCT FROM OLD.country
  THEN
    RAISE EXCEPTION 'Users may only edit caption, photos, filter, and alt text on a post';
  END IF;

  RETURN NEW;
END;
$function$;