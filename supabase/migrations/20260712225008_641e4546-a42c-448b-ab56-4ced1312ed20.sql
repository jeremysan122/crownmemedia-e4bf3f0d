
CREATE OR REPLACE FUNCTION public.shekel_spend_allocations_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $fn$
BEGIN
  RAISE EXCEPTION 'shekel_spend_allocations is append-only (forensic evidence)'
    USING ERRCODE = '42501';
END;
$fn$;

CREATE OR REPLACE FUNCTION public.boost_token_spend_allocations_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $fn$
BEGIN
  RAISE EXCEPTION 'boost_token_spend_allocations is append-only (forensic evidence)'
    USING ERRCODE = '42501';
END;
$fn$;
