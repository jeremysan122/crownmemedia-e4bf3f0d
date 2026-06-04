-- Revoke column-level UPDATE on age_confirmed and dob from authenticated users.
-- Only SECURITY DEFINER RPCs (confirm_my_age, update_my_dob) may write these columns.
REVOKE UPDATE ON public.profiles_private FROM authenticated;
GRANT UPDATE (email, updated_at) ON public.profiles_private TO authenticated;

-- Belt and suspenders: a RESTRICTIVE policy that blocks any UPDATE statement
-- attempting to change age_confirmed or dob via the table API.
DROP POLICY IF EXISTS "no_direct_age_or_dob_update" ON public.profiles_private;
CREATE POLICY "no_direct_age_or_dob_update"
  ON public.profiles_private
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (
    age_confirmed = (SELECT pp.age_confirmed FROM public.profiles_private pp WHERE pp.id = profiles_private.id)
    AND dob       = (SELECT pp.dob           FROM public.profiles_private pp WHERE pp.id = profiles_private.id)
  );