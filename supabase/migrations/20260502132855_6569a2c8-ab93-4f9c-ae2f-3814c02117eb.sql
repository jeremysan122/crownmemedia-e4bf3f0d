
CREATE OR REPLACE FUNCTION public.confirm_my_age(_dob date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF _dob IS NULL THEN
    RAISE EXCEPTION 'Date of birth required';
  END IF;
  IF _dob > (CURRENT_DATE - INTERVAL '18 years') THEN
    RAISE EXCEPTION 'You must be 18 or older to use CrownMe';
  END IF;

  INSERT INTO public.profiles_private (id, dob, age_confirmed)
  VALUES (auth.uid(), _dob, true)
  ON CONFLICT (id) DO UPDATE
    SET dob = EXCLUDED.dob,
        age_confirmed = true,
        updated_at = now();
END $$;

REVOKE ALL ON FUNCTION public.confirm_my_age(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_my_age(date) TO authenticated;

SELECT public.assert_security_invariants();
