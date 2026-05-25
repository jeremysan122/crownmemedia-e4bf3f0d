
CREATE OR REPLACE FUNCTION public.prevent_battle_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'battles are immutable history and cannot be deleted';
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_battle_vote_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'battle votes are immutable history and cannot be deleted';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.prevent_battle_delete() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_battle_vote_delete() FROM PUBLIC, anon, authenticated;
