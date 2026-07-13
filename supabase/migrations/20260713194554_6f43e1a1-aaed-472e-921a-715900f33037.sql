CREATE OR REPLACE FUNCTION public.my_owned_avatar_frames()
 RETURNS TABLE(frame_id uuid, slug text, name text, collection_slug text, asset_url text, is_permanent boolean, expires_at timestamp with time zone, achievement_id uuid, granted_at timestamp with time zone, equipped boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_equipped uuid;
BEGIN
  IF v_user IS NULL THEN RETURN; END IF;
  SELECT equipped_avatar_frame_id INTO v_equipped FROM public.profiles WHERE id = v_user;

  RETURN QUERY
  SELECT
    f.id, f.slug, f.name, c.slug,
    COALESCE(f.animated_asset_url, f.static_asset_url, f.thumbnail_asset_url) AS asset_url,
    uaf.is_permanent, uaf.expires_at,
    uaf.achievement_id, uaf.granted_at,
    (v_equipped = f.id)
  FROM public.user_avatar_frames uaf
  JOIN public.avatar_frames f ON f.id = uaf.avatar_frame_id
  LEFT JOIN public.avatar_frame_collections c ON c.id = f.collection_id
  WHERE uaf.user_id = v_user
    AND uaf.is_revoked = false
    AND (uaf.expires_at IS NULL OR uaf.expires_at > now())
  ORDER BY uaf.granted_at DESC;
END;
$function$;