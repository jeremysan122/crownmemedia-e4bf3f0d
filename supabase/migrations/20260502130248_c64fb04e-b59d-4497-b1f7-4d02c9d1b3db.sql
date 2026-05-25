-- 1) Restrict bundle SELECT to authenticated users (hides stripe_price_id from anon)
DROP POLICY IF EXISTS "Bundles viewable by everyone" ON public.shekel_bundles;
CREATE POLICY "Bundles viewable by authenticated"
ON public.shekel_bundles
FOR SELECT
TO authenticated
USING (active = true OR public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Boost bundles viewable by everyone" ON public.boost_bundles;
CREATE POLICY "Boost bundles viewable by authenticated"
ON public.boost_bundles
FOR SELECT
TO authenticated
USING (active = true OR public.has_role(auth.uid(), 'admin'::app_role));

-- 2) Tighten battles UPDATE policy: participants may only change opponent_post_id.
-- Admins keep full update via separate policy.
DROP POLICY IF EXISTS "Participants can update battle limited" ON public.battles;

CREATE POLICY "Participants update opponent_post_id only"
ON public.battles
FOR UPDATE
TO authenticated
USING (auth.uid() = challenger_id OR auth.uid() = opponent_id)
WITH CHECK (
  (auth.uid() = challenger_id OR auth.uid() = opponent_id)
  AND challenger_id   = (SELECT b.challenger_id   FROM public.battles b WHERE b.id = battles.id)
  AND opponent_id     = (SELECT b.opponent_id     FROM public.battles b WHERE b.id = battles.id)
  AND challenger_post_id = (SELECT b.challenger_post_id FROM public.battles b WHERE b.id = battles.id)
  AND status          = (SELECT b.status          FROM public.battles b WHERE b.id = battles.id)
  AND winner_id IS NOT DISTINCT FROM (SELECT b.winner_id FROM public.battles b WHERE b.id = battles.id)
  AND challenger_votes = (SELECT b.challenger_votes FROM public.battles b WHERE b.id = battles.id)
  AND opponent_votes  = (SELECT b.opponent_votes  FROM public.battles b WHERE b.id = battles.id)
  AND ends_at IS NOT DISTINCT FROM (SELECT b.ends_at FROM public.battles b WHERE b.id = battles.id)
  AND created_at      = (SELECT b.created_at      FROM public.battles b WHERE b.id = battles.id)
);

CREATE POLICY "Admins update battles"
ON public.battles
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));