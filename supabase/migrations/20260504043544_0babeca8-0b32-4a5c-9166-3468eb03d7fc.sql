-- Replace get_or_create_my_invite_code with a generator that does not depend
-- on pgcrypto's gen_random_bytes (not available in all environments). Uses
-- gen_random_uuid() (available via pgcrypto core / Postgres 13+) and maps to
-- an unambiguous 8-char alphanumeric code (no 0/O/1/I confusion).
CREATE OR REPLACE FUNCTION public.get_or_create_my_invite_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text;
  v_uid uuid := auth.uid();
  v_alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- 32 chars, no 0/O/1/I
  v_uuid text;
  v_buf text;
  v_idx int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT code INTO v_code FROM public.invite_codes WHERE user_id = v_uid;
  IF v_code IS NOT NULL THEN RETURN v_code; END IF;

  FOR i IN 1..8 LOOP
    v_uuid := replace(gen_random_uuid()::text, '-', '');
    v_buf := '';
    FOR j IN 0..7 LOOP
      -- Take 2 hex chars at a time, mod into the alphabet
      v_idx := (('x' || substr(v_uuid, j*2 + 1, 2))::bit(8)::int % 32);
      v_buf := v_buf || substr(v_alphabet, v_idx + 1, 1);
    END LOOP;
    BEGIN
      INSERT INTO public.invite_codes (user_id, code) VALUES (v_uid, v_buf);
      RETURN v_buf;
    EXCEPTION WHEN unique_violation THEN
      NULL;
    END;
  END LOOP;
  RAISE EXCEPTION 'Could not allocate invite code';
END;
$$;

REVOKE ALL ON FUNCTION public.get_or_create_my_invite_code() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_or_create_my_invite_code() TO authenticated;