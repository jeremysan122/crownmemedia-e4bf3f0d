CREATE OR REPLACE FUNCTION public.get_post_share_status(_post_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _exists boolean;
  _removed boolean;
BEGIN
  SELECT TRUE, is_removed
    INTO _exists, _removed
  FROM public.posts
  WHERE id = _post_id;

  IF NOT FOUND THEN
    RETURN 'deleted';
  END IF;

  IF _removed THEN
    RETURN 'removed';
  END IF;

  RETURN 'visible';
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_post_share_status(uuid) TO anon, authenticated, service_role;