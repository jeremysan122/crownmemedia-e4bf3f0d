
-- Fix 1: posts_guard_owner_updates is currently raising on every non-admin UPDATE
-- of posts (including system-driven recalcs from votes/comments/shares triggers).
-- Restrict it to actual owner self-edits via the API; system triggers and
-- SECURITY DEFINER functions should pass through.
CREATE OR REPLACE FUNCTION public.posts_guard_owner_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  -- Allow service role, admins, moderators, and any non-user-context update
  IF auth.uid() IS NULL
     OR public.has_role(auth.uid(), 'admin'::app_role)
     OR public.has_role(auth.uid(), 'moderator'::app_role) THEN
    RETURN NEW;
  END IF;

  -- Only enforce field restrictions when the OWNER themselves is editing.
  -- Trigger-driven recalcs (votes/comments/shares/battle wins) execute under
  -- the voter/commenter's auth.uid(), not the post owner's, so they pass.
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

-- Fix 2: battles_guard_participant_updates currently blocks the opponent from
-- accepting/declining a challenge because status changes were forbidden.
-- Allow the opponent to set opponent_post_id and transition status from
-- 'pending' to 'active' or 'declined'. Everything else stays locked.
CREATE OR REPLACE FUNCTION public.battles_guard_participant_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF auth.uid() IS NULL OR public.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;

  -- Block changes to immutable identifiers and tallies in all cases.
  IF NEW.challenger_votes IS DISTINCT FROM OLD.challenger_votes
     OR NEW.opponent_votes IS DISTINCT FROM OLD.opponent_votes
     OR NEW.winner_id IS DISTINCT FROM OLD.winner_id
     OR NEW.challenger_id IS DISTINCT FROM OLD.challenger_id
     OR NEW.opponent_id IS DISTINCT FROM OLD.opponent_id
     OR NEW.challenger_post_id IS DISTINCT FROM OLD.challenger_post_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'Participants cannot modify protected battle fields';
  END IF;

  -- Status transitions: opponent accepting/declining a pending challenge.
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF auth.uid() <> OLD.opponent_id THEN
      RAISE EXCEPTION 'Only the challenged opponent can accept or decline this battle';
    END IF;
    IF OLD.status::text <> 'pending' OR NEW.status::text NOT IN ('active','declined') THEN
      RAISE EXCEPTION 'Invalid battle status transition: % -> %', OLD.status, NEW.status;
    END IF;
    -- When accepting, opponent_post_id must be set
    IF NEW.status::text = 'active' AND NEW.opponent_post_id IS NULL THEN
      RAISE EXCEPTION 'You must pick a post to accept the duel';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- Fix 3: Update the participant UPDATE RLS policy to permit the same
-- pending->active/declined transitions (the previous policy required
-- status to remain identical).
DROP POLICY IF EXISTS "Participants update opponent_post_id only" ON public.battles;
CREATE POLICY "Participants accept or decline pending battle"
ON public.battles
FOR UPDATE
TO authenticated
USING ((auth.uid() = challenger_id) OR (auth.uid() = opponent_id))
WITH CHECK (
  ((auth.uid() = challenger_id) OR (auth.uid() = opponent_id))
  AND challenger_id = (SELECT b.challenger_id FROM public.battles b WHERE b.id = battles.id)
  AND opponent_id = (SELECT b.opponent_id FROM public.battles b WHERE b.id = battles.id)
  AND challenger_post_id = (SELECT b.challenger_post_id FROM public.battles b WHERE b.id = battles.id)
  AND winner_id IS NOT DISTINCT FROM (SELECT b.winner_id FROM public.battles b WHERE b.id = battles.id)
  AND challenger_votes = (SELECT b.challenger_votes FROM public.battles b WHERE b.id = battles.id)
  AND opponent_votes = (SELECT b.opponent_votes FROM public.battles b WHERE b.id = battles.id)
  AND created_at = (SELECT b.created_at FROM public.battles b WHERE b.id = battles.id)
);
