
CREATE OR REPLACE FUNCTION public.schedule_live_battle(
  _opponent_id uuid,
  _scheduled_start_at timestamptz,
  _duration_seconds integer DEFAULT 300,
  _category_slug text DEFAULT NULL,
  _region text DEFAULT NULL
)
RETURNS public.live_battles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_flag boolean;
  v_row public.live_battles;
  v_duration integer;
  v_room text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT public.is_feature_enabled('live_battles_enabled') INTO v_flag;
  IF NOT COALESCE(v_flag, false) THEN
    RAISE EXCEPTION 'feature_disabled';
  END IF;

  IF _opponent_id IS NULL OR _opponent_id = v_uid THEN
    RAISE EXCEPTION 'invalid_opponent';
  END IF;

  IF _scheduled_start_at IS NULL
     OR _scheduled_start_at < (now() + interval '5 minutes')
     OR _scheduled_start_at > (now() + interval '30 days') THEN
    RAISE EXCEPTION 'invalid_scheduled_time';
  END IF;

  -- Block check (both directions)
  IF EXISTS (
    SELECT 1 FROM public.blocks
    WHERE (blocker_id = v_uid AND blocked_id = _opponent_id)
       OR (blocker_id = _opponent_id AND blocked_id = v_uid)
  ) THEN
    RAISE EXCEPTION 'blocked';
  END IF;

  -- Clamp duration to allowed CHECK range 60..3600
  v_duration := GREATEST(60, LEAST(3600, COALESCE(_duration_seconds, 300)));

  -- Basic category validity (optional): must exist if provided
  IF _category_slug IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.main_categories WHERE slug = _category_slug AND is_active = true
  ) THEN
    RAISE EXCEPTION 'invalid_category';
  END IF;

  -- Reuse rate limit key from live battle creation
  PERFORM public.enforce_rate_limit('livebattle:create', 20, 3600);

  v_room := 'battle_' || replace(gen_random_uuid()::text, '-', '');

  INSERT INTO public.live_battles (
    host_id, opponent_id, room_name, status, duration_seconds,
    category_slug, region, scheduled_start_at
  )
  VALUES (
    v_uid, _opponent_id, v_room, 'scheduled', v_duration,
    _category_slug, NULLIF(_region, ''), _scheduled_start_at
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.schedule_live_battle(uuid, timestamptz, integer, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.schedule_live_battle(uuid, timestamptz, integer, text, text) TO authenticated;
