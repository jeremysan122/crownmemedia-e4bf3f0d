DROP FUNCTION IF EXISTS public.my_achievements();

CREATE OR REPLACE FUNCTION public.my_achievements()
 RETURNS TABLE(achievement_id uuid, slug text, name text, description text, collection_id uuid, collection_slug text, rarity text, is_founder_only boolean, is_secret boolean, avatar_frame_id uuid, requirement_logic jsonb, checkpoint_rewards jsonb, progress jsonb, completion_percent numeric, highest_checkpoint integer, status text, started_at timestamp with time zone, completed_at timestamp with time zone, rewards jsonb, gates jsonb, starts_at timestamp with time zone, ends_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_qad int;
  v_weeks int;
  v_age_days int;
  v_is_founder boolean;
BEGIN
  IF v_user IS NULL THEN RETURN; END IF;

  v_is_founder := public.is_founder(v_user);

  SELECT count(*) INTO v_qad FROM public.user_active_days WHERE user_id = v_user;
  SELECT count(DISTINCT date_trunc('week', activity_date)) INTO v_weeks
    FROM public.user_active_days WHERE user_id = v_user;
  SELECT GREATEST(0, EXTRACT(EPOCH FROM (now() - u.created_at))/86400)::int
    INTO v_age_days FROM auth.users u WHERE u.id = v_user;

  RETURN QUERY
  SELECT
    ad.id,
    ad.slug, ad.name, ad.description,
    ad.collection_id, c.slug,
    ad.rarity,
    ad.is_founder_only, ad.is_secret,
    ad.avatar_frame_id,
    ad.requirement_logic,
    ad.checkpoint_rewards,
    COALESCE(p.progress, '{}'::jsonb),
    COALESCE(p.completion_percent, 0)::numeric,
    COALESCE(p.highest_checkpoint, 0),
    COALESCE(p.status, 'in_progress'),
    p.started_at,
    p.completed_at,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'checkpoint', r.checkpoint,
        'reward_type', r.reward_type,
        'reward_id', r.reward_id,
        'granted_at', r.granted_at,
        'expires_at', r.expires_at,
        'is_revoked', r.is_revoked
      ) ORDER BY r.checkpoint)
      FROM public.user_achievement_rewards r
      WHERE r.user_id = v_user AND r.achievement_id = ad.id AND r.is_revoked = false
    ), '[]'::jsonb),
    jsonb_build_object(
      'account_age_days', v_age_days,
      'required_account_age_days', ad.minimum_account_age_days,
      'qualified_active_days', v_qad,
      'required_qualified_active_days', ad.minimum_qualified_active_days,
      'distinct_active_weeks', v_weeks,
      'required_distinct_active_weeks', ad.minimum_distinct_active_weeks,
      'gates_ok', (
        v_age_days >= COALESCE(ad.minimum_account_age_days,0)
        AND v_qad >= COALESCE(ad.minimum_qualified_active_days,0)
        AND v_weeks >= COALESCE(ad.minimum_distinct_active_weeks,0)
      )
    ),
    ad.starts_at,
    ad.ends_at
  FROM public.achievement_definitions ad
  LEFT JOIN public.avatar_frame_collections c ON c.id = ad.collection_id
  LEFT JOIN public.user_achievement_progress p
    ON p.achievement_id = ad.id AND p.user_id = v_user
  WHERE ad.is_active = true
    AND (ad.is_founder_only = false OR v_is_founder = true)
    AND (ad.is_secret = false OR p.status IS NOT NULL)
    AND (ad.starts_at IS NULL OR ad.starts_at <= now())
    AND (
      ad.ends_at IS NULL
      OR ad.ends_at >= now()
      OR (p.status = 'completed')
    )
  ORDER BY c.display_order NULLS LAST, ad.display_order;
END;
$function$;