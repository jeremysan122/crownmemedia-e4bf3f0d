-- 1) Server-side rate-limited typing broadcast for live battle chat.
-- Clients call this instead of sending realtime broadcasts directly, so a
-- malicious client can't spam beyond the enforced interval regardless of
-- what it does client-side. Uses realtime.send() to fan out on the same
-- channel the LiveBattleComments component already listens on.

CREATE OR REPLACE FUNCTION public.broadcast_live_battle_typing(
  _battle_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _uid UUID := auth.uid();
  _now TIMESTAMPTZ := now();
  _window_ms INT := 1500;
  _key TEXT;
  _last TIMESTAMPTZ;
  _username TEXT;
  _is_live BOOLEAN;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  -- Only allow typing signal for battles that are currently live.
  SELECT (status = 'live') INTO _is_live
  FROM public.live_battles WHERE id = _battle_id;
  IF NOT COALESCE(_is_live, false) THEN
    RETURN false;
  END IF;

  _key := 'lb_typing:' || _battle_id::text || ':' || _uid::text;

  -- Read the last broadcast window for this (user, battle).
  SELECT window_start INTO _last
  FROM public.rate_limits
  WHERE key = _key AND bucket = 'lb_typing' AND user_id = _uid
  ORDER BY window_start DESC
  LIMIT 1;

  IF _last IS NOT NULL AND _now - _last < make_interval(secs => _window_ms / 1000.0) THEN
    -- Server-side throttled — silently drop.
    RETURN false;
  END IF;

  -- Record this broadcast slot (idempotent upsert).
  INSERT INTO public.rate_limits (key, bucket, user_id, count, window_start)
  VALUES (_key, 'lb_typing', _uid, 1, _now)
  ON CONFLICT DO NOTHING;

  -- Best-effort cleanup: drop rows older than 30s for this key.
  DELETE FROM public.rate_limits
  WHERE key = _key AND window_start < _now - interval '30 seconds';

  SELECT username INTO _username FROM public.profiles WHERE id = _uid;

  -- Fan out on the same topic the client listens on.
  PERFORM realtime.send(
    jsonb_build_object('user_id', _uid, 'username', _username),
    'typing',
    'live-battle-comments:' || _battle_id::text,
    false
  );
  RETURN true;
EXCEPTION WHEN OTHERS THEN
  -- Never let a broadcast failure abort the caller.
  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.broadcast_live_battle_typing(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.broadcast_live_battle_typing(UUID) TO authenticated;

-- 2) Add 'escalated' status to reports so moderators can promote reports
-- that need higher-level review without resolving/dismissing them.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'escalated'
      AND enumtypid = 'public.report_status'::regtype
  ) THEN
    ALTER TYPE public.report_status ADD VALUE 'escalated';
  END IF;
END $$;
