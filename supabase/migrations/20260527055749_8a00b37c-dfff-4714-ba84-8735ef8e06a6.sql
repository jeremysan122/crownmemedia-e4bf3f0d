
-- Extend authenticated allowlist with gender (used by race/category UI)
GRANT SELECT (gender) ON public.profiles TO authenticated;

-- Admin moderation list RPC: returns ban/suspension fields, gated by role
CREATE OR REPLACE FUNCTION public.admin_list_users(_query text DEFAULT NULL, _limit int DEFAULT 40)
RETURNS TABLE (
  id uuid,
  username text,
  city text,
  country text,
  is_suspended boolean,
  is_banned boolean,
  banned_reason text,
  banned_at timestamptz,
  banned_by uuid,
  deactivated_at timestamptz,
  deletion_requested_at timestamptz,
  followers_count int,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role)
       OR public.has_role(auth.uid(), 'moderator'::app_role)) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  RETURN QUERY
  SELECT p.id, p.username, p.city, p.country, p.is_suspended, p.is_banned,
         p.banned_reason, p.banned_at, p.banned_by,
         p.deactivated_at, p.deletion_requested_at,
         p.followers_count, p.created_at
  FROM public.profiles p
  WHERE _query IS NULL OR p.username ILIKE '%' || _query || '%'
  ORDER BY p.created_at DESC
  LIMIT LEAST(GREATEST(_limit, 1), 200);
END $$;

REVOKE EXECUTE ON FUNCTION public.admin_list_users(text, int) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_list_users(text, int) TO authenticated;
