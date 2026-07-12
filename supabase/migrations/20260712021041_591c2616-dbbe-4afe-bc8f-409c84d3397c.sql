
DROP FUNCTION IF EXISTS public.royal_wave82a_shield_selftest();
DROP FUNCTION IF EXISTS public.royal_wave82a_dispute_match_selftest();
DROP FUNCTION IF EXISTS public.royal_wave82a_race_setup(uuid);
DROP FUNCTION IF EXISTS public.royal_wave82a_race_call(uuid,text,timestamptz,timestamptz);
DROP FUNCTION IF EXISTS public.royal_wave82a_race_cleanup(uuid);
DROP FUNCTION IF EXISTS public.royal_wave82a_set_founder_cap(int);
DROP FUNCTION IF EXISTS public.royal_wave82a_founder_claimed();
