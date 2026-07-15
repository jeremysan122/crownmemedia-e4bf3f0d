CREATE OR REPLACE FUNCTION public.admin_verify_crown_asset(_crown_id uuid, _verified boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'admin role required';
  END IF;
  UPDATE public.achievement_crowns
     SET image_quality_verified = _verified,
         updated_at = now()
   WHERE id = _crown_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_verify_crown_asset(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_verify_crown_asset(uuid, boolean) TO authenticated, service_role;