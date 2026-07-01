-- 1. Revoke SELECT on stripe_price_id from anon/authenticated on catalog tables
REVOKE SELECT (stripe_price_id) ON public.shekel_bundles FROM anon, authenticated;
REVOKE SELECT (stripe_price_id) ON public.boost_bundles FROM anon, authenticated;
REVOKE SELECT (stripe_price_id) ON public.royal_pass_plans FROM anon, authenticated;

-- Preserve service_role and future-safe: explicit grant back to service_role
GRANT SELECT (stripe_price_id) ON public.shekel_bundles TO service_role;
GRANT SELECT (stripe_price_id) ON public.boost_bundles TO service_role;
GRANT SELECT (stripe_price_id) ON public.royal_pass_plans TO service_role;

-- 2. Admin-only RPCs to return full catalog rows (SECURITY DEFINER, gated by has_role)
CREATE OR REPLACE FUNCTION public.admin_list_shekel_bundles()
RETURNS SETOF public.shekel_bundles
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') AND NOT public.has_role(auth.uid(), 'moderator') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  RETURN QUERY SELECT * FROM public.shekel_bundles ORDER BY sort_order ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_boost_bundles()
RETURNS SETOF public.boost_bundles
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') AND NOT public.has_role(auth.uid(), 'moderator') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  RETURN QUERY SELECT * FROM public.boost_bundles ORDER BY sort_order ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_royal_pass_plans()
RETURNS SETOF public.royal_pass_plans
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') AND NOT public.has_role(auth.uid(), 'moderator') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  RETURN QUERY SELECT * FROM public.royal_pass_plans ORDER BY sort_order ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_shekel_bundles() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_list_boost_bundles() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_list_royal_pass_plans() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_shekel_bundles() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_boost_bundles() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_royal_pass_plans() TO authenticated;

-- 3. Revoke anon EXECUTE from is_royal_pass_active (authenticated retains access)
REVOKE EXECUTE ON FUNCTION public.is_royal_pass_active(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_royal_pass_active(uuid) TO authenticated;