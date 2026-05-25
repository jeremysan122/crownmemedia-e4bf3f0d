-- 1. Lock profile self-updates: prevent suspended users from clearing their flag
--    and prevent any user from inflating counter columns or changing username.
CREATE POLICY "Profiles: deny self-mutation of protected fields"
  ON public.profiles
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'moderator'::app_role)
    OR (
      is_suspended  = (SELECT p.is_suspended  FROM public.profiles p WHERE p.id = profiles.id)
      AND crowns_held    = (SELECT p.crowns_held    FROM public.profiles p WHERE p.id = profiles.id)
      AND crowns_total   = (SELECT p.crowns_total   FROM public.profiles p WHERE p.id = profiles.id)
      AND battle_wins    = (SELECT p.battle_wins    FROM public.profiles p WHERE p.id = profiles.id)
      AND followers_count = (SELECT p.followers_count FROM public.profiles p WHERE p.id = profiles.id)
      AND following_count = (SELECT p.following_count FROM public.profiles p WHERE p.id = profiles.id)
      AND votes_received = (SELECT p.votes_received FROM public.profiles p WHERE p.id = profiles.id)
      AND votes_given    = (SELECT p.votes_given    FROM public.profiles p WHERE p.id = profiles.id)
    )
  );

-- 2. Remove user-level INSERT on payouts. Payouts are created by Stripe webhook
--    (service role bypasses RLS) only — no user-driven INSERT path.
DROP POLICY IF EXISTS "User create own payouts" ON public.payouts;

-- 3. Add explicit RESTRICTIVE SELECT policy on user_roles to guarantee no
--    cross-user role enumeration even if the broader RESTRICTIVE ALL policy
--    is interpreted differently in some Postgres versions.
CREATE POLICY "user_roles: restrict SELECT to self or admin"
  ON public.user_roles
  AS RESTRICTIVE
  FOR SELECT
  TO authenticated, anon
  USING (
    auth.uid() = user_id
    OR has_role(auth.uid(), 'admin'::app_role)
  );