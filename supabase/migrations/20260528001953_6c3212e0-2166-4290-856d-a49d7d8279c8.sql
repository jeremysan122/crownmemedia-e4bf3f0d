CREATE OR REPLACE FUNCTION public.has_active_boost(_user_id uuid, _boost_type text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.boosts
    WHERE user_id = _user_id
      AND boost_type::text = _boost_type
      AND active = true
      AND (expires_at IS NULL OR expires_at > now())
  );
$$;

GRANT EXECUTE ON FUNCTION public.has_active_boost(uuid, text) TO anon, authenticated;