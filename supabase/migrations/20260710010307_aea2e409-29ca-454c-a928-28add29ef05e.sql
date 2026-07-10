
-- Add category + region to live_battles and extend guard + RPC.
ALTER TABLE public.live_battles
  ADD COLUMN IF NOT EXISTS category_slug TEXT,
  ADD COLUMN IF NOT EXISTS region TEXT;

-- Extend guard: lock these after creation (only admins/mods can change).
CREATE OR REPLACE FUNCTION public.tg_live_battles_guard()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE is_priv BOOLEAN;
BEGIN
  is_priv := public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator')
          OR current_setting('role', true) = 'service_role';
  IF is_priv THEN RETURN NEW; END IF;
  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.host_votes IS DISTINCT FROM OLD.host_votes
     OR NEW.opponent_votes IS DISTINCT FROM OLD.opponent_votes
     OR NEW.winner_id IS DISTINCT FROM OLD.winner_id
     OR NEW.started_at IS DISTINCT FROM OLD.started_at
     OR NEW.ends_at IS DISTINCT FROM OLD.ends_at
     OR NEW.ended_reason IS DISTINCT FROM OLD.ended_reason
     OR NEW.force_ended_by IS DISTINCT FROM OLD.force_ended_by
     OR NEW.is_hidden IS DISTINCT FROM OLD.is_hidden
     OR NEW.host_id IS DISTINCT FROM OLD.host_id
     OR NEW.opponent_id IS DISTINCT FROM OLD.opponent_id
     OR NEW.room_name IS DISTINCT FROM OLD.room_name
     OR NEW.duration_seconds IS DISTINCT FROM OLD.duration_seconds
     OR NEW.category_slug IS DISTINCT FROM OLD.category_slug
     OR NEW.region IS DISTINCT FROM OLD.region
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'not_authorized_to_modify_protected_fields';
  END IF;
  RETURN NEW;
END; $$;

-- New RPC signature that accepts category + region. Keep the old one for callers.
CREATE OR REPLACE FUNCTION public.create_live_battle(
  _opponent_id UUID,
  _duration_seconds INTEGER DEFAULT 300,
  _category_slug TEXT DEFAULT NULL,
  _region TEXT DEFAULT NULL
)
RETURNS public.live_battles
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

  -- Validate category slug against main_categories if provided
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

  INSERT INTO public.error_logs(user_id, message, source, level, metadata)
  VALUES (uid, 'live_battle_created', 'monitoring', 'info',
          jsonb_build_object('event','live_battle_created','battle_id',row.id,'opponent_id',_opponent_id,'duration',dur,'category',cat,'region',reg));

  RETURN row;
END; $$;

REVOKE ALL ON FUNCTION public.create_live_battle(UUID, INTEGER, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_live_battle(UUID, INTEGER, TEXT, TEXT) TO authenticated;

-- Drop the old 2-arg signature to avoid overload ambiguity from PostgREST.
DROP FUNCTION IF EXISTS public.create_live_battle(UUID, INTEGER);
