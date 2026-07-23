
-- 1) Idempotency ledger for LiveKit webhooks
CREATE TABLE IF NOT EXISTS public.livekit_webhook_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  room_name TEXT,
  participant_identity TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  raw JSONB
);

GRANT ALL ON public.livekit_webhook_events TO service_role;
-- No anon/authenticated access; this is server-only telemetry.

ALTER TABLE public.livekit_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins can read livekit webhook events"
  ON public.livekit_webhook_events
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS livekit_webhook_events_room_idx
  ON public.livekit_webhook_events (room_name, received_at DESC);

-- 2) End a live battle addressed by its LiveKit room name.
-- Called by the livekit-webhook edge function with the service role. Ignores
-- the __lobby suffix, no-ops when the battle is not live/pending.
CREATE OR REPLACE FUNCTION public.live_battle_end_by_room(_room_name TEXT, _reason TEXT DEFAULT 'room_finished')
RETURNS public.live_battles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  clean_name TEXT := regexp_replace(coalesce(_room_name,''), '__lobby$', '');
  b public.live_battles%ROWTYPE;
BEGIN
  IF clean_name = '' THEN
    RAISE EXCEPTION 'missing_room_name';
  END IF;
  SELECT * INTO b FROM public.live_battles WHERE room_name = clean_name FOR UPDATE;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  IF b.status IN ('ended','cancelled','declined') THEN
    RETURN b;
  END IF;
  UPDATE public.live_battles
     SET status = 'ended',
         ends_at = COALESCE(ends_at, now()),
         ended_reason = COALESCE(ended_reason, _reason),
         winner_id = CASE
           WHEN host_votes > opponent_votes THEN host_id
           WHEN opponent_votes > host_votes THEN opponent_id
           ELSE NULL
         END
   WHERE id = b.id
   RETURNING * INTO b;
  RETURN b;
END; $$;

REVOKE ALL ON FUNCTION public.live_battle_end_by_room(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.live_battle_end_by_room(TEXT, TEXT) TO service_role;
