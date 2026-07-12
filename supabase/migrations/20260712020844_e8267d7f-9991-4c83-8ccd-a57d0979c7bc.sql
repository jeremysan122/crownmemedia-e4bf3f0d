
CREATE OR REPLACE FUNCTION public.royal_wave82a_set_founder_cap(_cap int)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN UPDATE public.founder_program_config SET member_cap = _cap WHERE id = 1; END; $$;
REVOKE ALL ON FUNCTION public.royal_wave82a_set_founder_cap(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.royal_wave82a_set_founder_cap(int) TO service_role;

CREATE OR REPLACE FUNCTION public.royal_wave82a_founder_claimed()
RETURNS int LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT count(*)::int FROM public.founder_grants WHERE status IN ('active','disputed');
$$;
REVOKE ALL ON FUNCTION public.royal_wave82a_founder_claimed() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.royal_wave82a_founder_claimed() TO service_role;
