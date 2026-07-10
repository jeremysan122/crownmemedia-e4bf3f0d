-- =========================================================================
-- Live Battles launch pass: viewers, accept/decline/cancel, notifications,
-- and INSERT lockdown. All privileged writes are SECURITY DEFINER RPCs.
-- =========================================================================

-- ---------- 1. live_battle_viewers table ---------------------------------

CREATE TABLE IF NOT EXISTS public.live_battle_viewers (
  battle_id   uuid NOT NULL REFERENCES public.live_battles(id) ON DELETE CASCADE,
  viewer_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (battle_id, viewer_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.live_battle_viewers TO authenticated;
GRANT ALL ON public.live_battle_viewers TO service_role;

ALTER TABLE public.live_battle_viewers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lbv_viewers_write_self ON public.live_battle_viewers;
CREATE POLICY lbv_viewers_write_self ON public.live_battle_viewers
  FOR ALL TO authenticated
  USING (viewer_id = auth.uid())
  WITH CHECK (viewer_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_lbv_battle_last_seen
  ON public.live_battle_viewers (battle_id, last_seen_at DESC);

-- Aggregate count only (no per-viewer disclosure).
CREATE OR REPLACE FUNCTION public.live_battle_viewer_count(_battle_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COUNT(*)::int
    FROM public.live_battle_viewers
   WHERE battle_id = _battle_id
     AND last_seen_at > now() - interval '60 seconds';
$$;

REVOKE ALL ON FUNCTION public.live_battle_viewer_count(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.live_battle_viewer_count(uuid) TO authenticated, service_role;

-- Heartbeat helper (upsert own row).
CREATE OR REPLACE FUNCTION public.live_battle_viewer_heartbeat(_battle_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.live_battles WHERE id = _battle_id) THEN
    RAISE EXCEPTION 'battle_not_found';
  END IF;
  INSERT INTO public.live_battle_viewers(battle_id, viewer_id, last_seen_at)
  VALUES (_battle_id, uid, now())
  ON CONFLICT (battle_id, viewer_id) DO UPDATE SET last_seen_at = EXCLUDED.last_seen_at;
END;
$$;

REVOKE ALL ON FUNCTION public.live_battle_viewer_heartbeat(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.live_battle_viewer_heartbeat(uuid) TO authenticated, service_role;

-- ---------- 2. Notification helper (uses existing `system` enum + payload.link) ----------

CREATE OR REPLACE FUNCTION public._notify_live_battle(
  _user_id uuid, _kind text, _title text, _body text, _battle_id uuid, _payload jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF _user_id IS NULL THEN RETURN; END IF;
  INSERT INTO public.notifications(user_id, type, title, body, payload)
  VALUES (
    _user_id, 'system'::notification_type, _title, _body,
    jsonb_build_object(
      'kind', _kind,
      'battle_id', _battle_id,
      'link', '/live/' || _battle_id::text
    ) || COALESCE(_payload, '{}'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public._notify_live_battle(uuid, text, text, text, uuid, jsonb) FROM PUBLIC, anon, authenticated;

-- ---------- 3. Accept / Decline / Cancel RPCs ---------------------------

CREATE OR REPLACE FUNCTION public.live_battle_accept(_battle_id uuid)
RETURNS live_battles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE b public.live_battles%ROWTYPE; uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO b FROM public.live_battles WHERE id = _battle_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'battle_not_found'; END IF;
  IF b.opponent_id <> uid THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF b.status <> 'pending' THEN RAISE EXCEPTION 'battle_not_pending'; END IF;

  UPDATE public.live_battles
     SET status = 'live',
         started_at = now(),
         ends_at = now() + make_interval(secs => b.duration_seconds)
   WHERE id = _battle_id
   RETURNING * INTO b;

  PERFORM public._notify_live_battle(
    b.host_id, 'live_battle_started',
    'Your live battle is starting', 'Your opponent joined — go live now.', b.id
  );
  PERFORM public._notify_live_battle(
    b.opponent_id, 'live_battle_started',
    'Live battle starting', 'You accepted. The stage is open.', b.id
  );

  INSERT INTO public.error_logs(user_id, message, source, level, metadata)
  VALUES (uid, 'live_battle_accepted', 'monitoring', 'info',
          jsonb_build_object('event','live_battle_accepted','battle_id', b.id));
  RETURN b;
END;
$$;

CREATE OR REPLACE FUNCTION public.live_battle_decline(_battle_id uuid)
RETURNS live_battles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE b public.live_battles%ROWTYPE; uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO b FROM public.live_battles WHERE id = _battle_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'battle_not_found'; END IF;
  IF b.opponent_id <> uid THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF b.status <> 'pending' THEN RAISE EXCEPTION 'battle_not_pending'; END IF;

  UPDATE public.live_battles
     SET status = 'declined', ended_reason = 'opponent_declined', ends_at = COALESCE(ends_at, now())
   WHERE id = _battle_id
   RETURNING * INTO b;

  PERFORM public._notify_live_battle(
    b.host_id, 'live_battle_declined',
    'Live battle declined', 'Your opponent declined the invite.', b.id
  );

  INSERT INTO public.error_logs(user_id, message, source, level, metadata)
  VALUES (uid, 'live_battle_declined', 'monitoring', 'info',
          jsonb_build_object('event','live_battle_declined','battle_id', b.id));
  RETURN b;
END;
$$;

CREATE OR REPLACE FUNCTION public.live_battle_cancel(_battle_id uuid)
RETURNS live_battles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE b public.live_battles%ROWTYPE; uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO b FROM public.live_battles WHERE id = _battle_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'battle_not_found'; END IF;
  IF b.host_id <> uid THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF b.status <> 'pending' THEN RAISE EXCEPTION 'battle_not_pending'; END IF;

  UPDATE public.live_battles
     SET status = 'cancelled', ended_reason = 'host_cancelled', ends_at = COALESCE(ends_at, now())
   WHERE id = _battle_id
   RETURNING * INTO b;

  PERFORM public._notify_live_battle(
    b.opponent_id, 'live_battle_cancelled',
    'Live battle cancelled', 'The host cancelled the invite.', b.id
  );

  INSERT INTO public.error_logs(user_id, message, source, level, metadata)
  VALUES (uid, 'live_battle_cancelled', 'monitoring', 'info',
          jsonb_build_object('event','live_battle_cancelled','battle_id', b.id));
  RETURN b;
END;
$$;

REVOKE ALL ON FUNCTION public.live_battle_accept(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.live_battle_decline(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.live_battle_cancel(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.live_battle_accept(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.live_battle_decline(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.live_battle_cancel(uuid) TO authenticated, service_role;

-- ---------- 4. Notification triggers on live_battles --------------------

CREATE OR REPLACE FUNCTION public.trg_live_battles_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  outcome text;
BEGIN
  -- Invite: pending row created.
  IF TG_OP = 'INSERT' AND NEW.status = 'pending' THEN
    PERFORM public._notify_live_battle(
      NEW.opponent_id, 'live_battle_invite',
      'You''ve been challenged to a live battle',
      'Tap to accept or decline the invite.', NEW.id
    );
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Ended: notify both with outcome. Skip if RPC already sent one (accept/decline/cancel handled separately).
    IF OLD.status <> 'ended' AND NEW.status = 'ended' THEN
      IF NEW.winner_id IS NULL THEN
        PERFORM public._notify_live_battle(NEW.host_id, 'live_battle_ended',
          'Live battle ended in a tie', 'Great match — no crown moved.', NEW.id,
          jsonb_build_object('outcome','tie'));
        PERFORM public._notify_live_battle(NEW.opponent_id, 'live_battle_ended',
          'Live battle ended in a tie', 'Great match — no crown moved.', NEW.id,
          jsonb_build_object('outcome','tie'));
      ELSE
        PERFORM public._notify_live_battle(NEW.winner_id, 'live_battle_ended',
          'You won your live battle', 'The audience picked you. 👑', NEW.id,
          jsonb_build_object('outcome','win'));
        PERFORM public._notify_live_battle(
          CASE WHEN NEW.winner_id = NEW.host_id THEN NEW.opponent_id ELSE NEW.host_id END,
          'live_battle_ended', 'You lost your live battle',
          'So close — get them next time.', NEW.id,
          jsonb_build_object('outcome','loss'));
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_live_battles_notify_ins ON public.live_battles;
CREATE TRIGGER trg_live_battles_notify_ins
  AFTER INSERT ON public.live_battles
  FOR EACH ROW EXECUTE FUNCTION public.trg_live_battles_notify();

DROP TRIGGER IF EXISTS trg_live_battles_notify_upd ON public.live_battles;
CREATE TRIGGER trg_live_battles_notify_upd
  AFTER UPDATE ON public.live_battles
  FOR EACH ROW EXECUTE FUNCTION public.trg_live_battles_notify();

-- ---------- 5. Lockdown: no direct client INSERT on live_battles/votes ----

REVOKE INSERT ON public.live_battles FROM authenticated, anon;
REVOKE INSERT ON public.live_battle_votes FROM authenticated, anon;

-- Ensure the RPC path (SECURITY DEFINER) can still write.
GRANT INSERT ON public.live_battles TO service_role;
GRANT INSERT ON public.live_battle_votes TO service_role;

-- ---------- 6. Realtime for lobby + viewer transitions ------------------

DO $$ BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.live_battles;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;
