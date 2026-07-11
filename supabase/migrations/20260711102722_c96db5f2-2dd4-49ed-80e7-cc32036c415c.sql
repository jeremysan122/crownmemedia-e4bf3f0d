-- Fix create_live_battle: it logged success into error_logs with level='info',
-- which violates the error_logs_level_check constraint (warn/error/fatal only).
-- Switch success telemetry to analytics_events and keep the RPC otherwise identical.
CREATE OR REPLACE FUNCTION public.create_live_battle(
  _opponent_id uuid,
  _duration_seconds integer DEFAULT 300,
  _category_slug text DEFAULT NULL::text,
  _region text DEFAULT NULL::text
)
RETURNS public.live_battles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  uid UUID := auth.uid();
  dur INTEGER;
  room TEXT;
  flag_on BOOLEAN;
  blocked BOOLEAN;
  cat TEXT;
  reg TEXT;
  row public.live_battles;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _opponent_id IS NULL OR _opponent_id = uid THEN RAISE EXCEPTION 'invalid_opponent'; END IF;

  SELECT public.is_feature_enabled('live_battles_enabled') INTO flag_on;
  IF NOT COALESCE(flag_on, false) THEN RAISE EXCEPTION 'feature_disabled'; END IF;

  PERFORM public.enforce_rate_limit('livebattle:create', 5, 3600);

  SELECT EXISTS(
    SELECT 1 FROM public.blocks
    WHERE (blocker_id = uid AND blocked_id = _opponent_id)
       OR (blocker_id = _opponent_id AND blocked_id = uid)
  ) INTO blocked;
  IF blocked THEN RAISE EXCEPTION 'blocked'; END IF;

  dur := GREATEST(60, LEAST(3600, COALESCE(_duration_seconds, 300)));

  IF _category_slug IS NOT NULL AND length(trim(_category_slug)) > 0 THEN
    SELECT slug INTO cat FROM public.main_categories WHERE slug = _category_slug AND is_active = true;
    IF cat IS NULL THEN RAISE EXCEPTION 'invalid_category'; END IF;
  END IF;

  IF _region IS NOT NULL AND length(trim(_region)) > 0 THEN
    reg := substring(trim(_region) FROM 1 FOR 80);
  END IF;

  room := 'lb_' || replace(gen_random_uuid()::text, '-', '');

  INSERT INTO public.live_battles(host_id, opponent_id, room_name, duration_seconds, category_slug, region)
  VALUES (uid, _opponent_id, room, dur, cat, reg)
  RETURNING * INTO row;

  -- Success telemetry: analytics_events, not error_logs.
  BEGIN
    INSERT INTO public.analytics_events(user_id, event_name, properties)
    VALUES (uid, 'live_battle_created',
            jsonb_build_object('battle_id', row.id, 'opponent_id', _opponent_id,
                               'duration', dur, 'category', cat, 'region', reg));
  EXCEPTION WHEN OTHERS THEN
    -- Never fail creation if telemetry hiccups.
    NULL;
  END;

  RETURN row;
END;
$function$;