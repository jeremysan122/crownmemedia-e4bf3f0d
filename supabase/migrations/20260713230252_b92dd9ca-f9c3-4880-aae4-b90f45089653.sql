-- 1. Scope avatar_frame_unlocks reads to owner + admin
DROP POLICY IF EXISTS "avatar_frame_unlocks_read_all" ON public.avatar_frame_unlocks;

CREATE POLICY "avatar_frame_unlocks_owner_read"
  ON public.avatar_frame_unlocks
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

-- 2. Pin search_path on flagged function
ALTER FUNCTION public._current_week_start() SET search_path = public;

-- 3. Remove materialized view from the Data API surface
REVOKE ALL ON public.achievement_rarity_stats FROM anon, authenticated;
