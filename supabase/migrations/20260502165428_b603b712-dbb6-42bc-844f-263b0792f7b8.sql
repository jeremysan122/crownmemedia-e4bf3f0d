-- 1) Tighten posts UPDATE guard: non-mod owners can only edit caption/image_url/image_urls
CREATE OR REPLACE FUNCTION public.posts_guard_owner_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Service role / admins / moderators can update anything
  IF auth.uid() IS NULL
     OR public.has_role(auth.uid(), 'admin'::app_role)
     OR public.has_role(auth.uid(), 'moderator'::app_role) THEN
    RETURN NEW;
  END IF;

  -- Owner-only edits: protected counters/identity
  IF NEW.crown_score IS DISTINCT FROM OLD.crown_score
     OR NEW.vote_count IS DISTINCT FROM OLD.vote_count
     OR NEW.comment_count IS DISTINCT FROM OLD.comment_count
     OR NEW.share_count IS DISTINCT FROM OLD.share_count
     OR NEW.battle_wins IS DISTINCT FROM OLD.battle_wins
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'Users cannot modify protected post fields (score/vote/comment/share/battle counts)';
  END IF;

  -- Whitelist: only caption, image_url, image_urls, is_removed (self-removal) may differ
  IF NEW.category IS DISTINCT FROM OLD.category
     OR NEW.city IS DISTINCT FROM OLD.city
     OR NEW.state IS DISTINCT FROM OLD.state
     OR NEW.country IS DISTINCT FROM OLD.country
  THEN
    RAISE EXCEPTION 'Users may only edit caption and photos on a post';
  END IF;

  RETURN NEW;
END;
$function$;

-- 2) Allow share_count edits to recalc the Crown Score (share & comment bonuses)
CREATE OR REPLACE FUNCTION public.trg_recalc_from_share()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.share_count IS DISTINCT FROM OLD.share_count THEN
    PERFORM public.recalc_post_score(NEW.id);
  END IF;
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS posts_recalc_on_share ON public.posts;
CREATE TRIGGER posts_recalc_on_share
AFTER UPDATE OF share_count ON public.posts
FOR EACH ROW EXECUTE FUNCTION public.trg_recalc_from_share();

-- 3) Moderator visibility & action on blocks (for moderation queue)
CREATE POLICY "Mods view all blocks"
ON public.blocks
FOR SELECT
USING (public.has_role(auth.uid(), 'moderator'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Mods delete any block"
ON public.blocks
FOR DELETE
USING (public.has_role(auth.uid(), 'moderator'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role));

-- 4) Allow moderators to mark a report unreported (status -> dismissed) — already covered by existing "Mods update reports"
