
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS frames_hidden boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.set_frames_hidden(_hidden boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  UPDATE public.profiles
     SET frames_hidden = COALESCE(_hidden, false)
   WHERE id = v_user;
END;
$$;

REVOKE ALL ON FUNCTION public.set_frames_hidden(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_frames_hidden(boolean) TO authenticated, service_role;
