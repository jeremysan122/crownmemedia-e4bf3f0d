
-- 1. PROFILES: column-level grants to hide sensitive fields
REVOKE SELECT ON public.profiles FROM anon, authenticated;

GRANT SELECT (
  id, username, profile_photo_url, bio, city, state, country,
  followers_count, following_count, votes_received, votes_given,
  crowns_held, crowns_total, battle_wins, is_suspended, created_at, updated_at,
  banner_url, banner_position_y, avatar_position_y, gender,
  is_private, hide_likes, hide_comments, hide_views, posts_visibility,
  links, verified, verified_at, liked_posts_public
) ON public.profiles TO anon, authenticated;

-- 2. VERIFICATION_REQUESTS: prevent users from editing admin-only fields
CREATE OR REPLACE FUNCTION public.verification_requests_block_user_field_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() = NEW.user_id
     AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    IF NEW.status        IS DISTINCT FROM OLD.status
       OR NEW.reviewer_id   IS DISTINCT FROM OLD.reviewer_id
       OR NEW.review_notes  IS DISTINCT FROM OLD.review_notes
       OR NEW.reviewed_at   IS DISTINCT FROM OLD.reviewed_at THEN
      RAISE EXCEPTION 'Users cannot modify review fields on verification_requests';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS verification_requests_block_user_field_changes ON public.verification_requests;
CREATE TRIGGER verification_requests_block_user_field_changes
BEFORE UPDATE ON public.verification_requests
FOR EACH ROW EXECUTE FUNCTION public.verification_requests_block_user_field_changes();

-- 3. BATTLE_VOTES: only voter + battle participants can see
DROP POLICY IF EXISTS "Battle votes viewable by everyone" ON public.battle_votes;
CREATE POLICY "Battle votes viewable by voter and participants"
ON public.battle_votes
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1 FROM public.battles b
    WHERE b.id = battle_votes.battle_id
      AND (auth.uid() = b.challenger_id OR auth.uid() = b.opponent_id)
  )
);

-- 4. Remove anon execute on internal SECURITY DEFINER helpers
REVOKE EXECUTE ON FUNCTION public.ensure_my_wallet() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.record_profile_visit(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_set_prize_stock(uuid, integer) FROM anon, public;
