
-- Live battle report cooldown + admin review queue

-- 1. Report RPC now includes remaining cooldown in error message.
DROP FUNCTION IF EXISTS public.live_battle_report(UUID, TEXT);

CREATE FUNCTION public.live_battle_report(_battle_id UUID, _reason TEXT)
RETURNS public.live_battle_reports
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid UUID := auth.uid();
  new_row public.live_battle_reports;
  dup_at TIMESTAMPTZ;
  window_start TIMESTAMPTZ;
  earliest_in_window TIMESTAMPTZ;
  hourly_count INT;
  secs INT;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _reason IS NULL OR char_length(trim(_reason)) < 5 THEN
    RAISE EXCEPTION 'invalid_reason';
  END IF;

  IF NOT EXISTS(SELECT 1 FROM public.live_battles WHERE id = _battle_id) THEN
    RAISE EXCEPTION 'battle_not_found';
  END IF;

  -- Per-battle duplicate cooldown (10 minutes)
  SELECT MAX(created_at) INTO dup_at
    FROM public.live_battle_reports
   WHERE battle_id = _battle_id
     AND reporter_id = uid
     AND created_at > now() - interval '10 minutes';
  IF dup_at IS NOT NULL THEN
    secs := GREATEST(1, CEIL(EXTRACT(EPOCH FROM (dup_at + interval '10 minutes' - now())))::INT);
    RAISE EXCEPTION 'duplicate_report:%', secs;
  END IF;

  -- Global rate limit: max 10 reports per hour per user across all battles
  window_start := now() - interval '1 hour';
  SELECT COUNT(*), MIN(created_at)
    INTO hourly_count, earliest_in_window
    FROM public.live_battle_reports
   WHERE reporter_id = uid
     AND created_at > window_start;
  IF hourly_count >= 10 THEN
    secs := GREATEST(1, CEIL(EXTRACT(EPOCH FROM (earliest_in_window + interval '1 hour' - now())))::INT);
    RAISE EXCEPTION 'rate_limited:%', secs;
  END IF;

  INSERT INTO public.live_battle_reports(battle_id, reporter_id, reason)
  VALUES (_battle_id, uid, substring(_reason from 1 for 500))
  RETURNING * INTO new_row;

  RETURN new_row;
END; $$;
REVOKE ALL ON FUNCTION public.live_battle_report(UUID,TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.live_battle_report(UUID,TEXT) TO authenticated;

-- 2. Admin queue: list reports with battle + reporter summary
CREATE OR REPLACE FUNCTION public.admin_list_live_battle_reports(
  _status TEXT DEFAULT NULL,
  _limit  INT  DEFAULT 50,
  _offset INT  DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  battle_id UUID,
  reporter_id UUID,
  reason TEXT,
  status TEXT,
  created_at TIMESTAMPTZ,
  handled_at TIMESTAMPTZ,
  handled_by UUID,
  reporter_username TEXT,
  reporter_photo TEXT,
  battle_room TEXT,
  battle_status TEXT,
  battle_host_id UUID,
  battle_opponent_id UUID,
  battle_category TEXT,
  battle_region TEXT,
  total_open INT
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid UUID := auth.uid(); is_mod BOOLEAN; open_total INT;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  is_mod := public.has_role(uid,'admin') OR public.has_role(uid,'moderator');
  IF NOT is_mod THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF _status IS NOT NULL AND _status NOT IN ('queued','processing','handled','rejected') THEN
    RAISE EXCEPTION 'invalid_status';
  END IF;

  SELECT COUNT(*) INTO open_total FROM public.live_battle_reports r
   WHERE r.status IN ('queued','processing');

  RETURN QUERY
    SELECT r.id, r.battle_id, r.reporter_id, r.reason, r.status, r.created_at,
           r.handled_at, r.handled_by,
           p.username, p.profile_photo_url,
           b.room_name, b.status::TEXT, b.host_id, b.opponent_id,
           b.category_slug, b.region,
           open_total
      FROM public.live_battle_reports r
      LEFT JOIN public.profiles p ON p.id = r.reporter_id
      LEFT JOIN public.live_battles b ON b.id = r.battle_id
     WHERE (_status IS NULL OR r.status = _status)
     ORDER BY r.created_at DESC
     LIMIT GREATEST(1, LEAST(_limit, 200))
    OFFSET GREATEST(0, _offset);
END; $$;
REVOKE ALL ON FUNCTION public.admin_list_live_battle_reports(TEXT,INT,INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_live_battle_reports(TEXT,INT,INT) TO authenticated;

-- 3. Admin action: move report status (queued -> processing -> handled/rejected)
CREATE OR REPLACE FUNCTION public.admin_update_live_battle_report_status(
  _report_id UUID,
  _status TEXT
) RETURNS public.live_battle_reports
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid UUID := auth.uid(); is_mod BOOLEAN; row public.live_battle_reports;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  is_mod := public.has_role(uid,'admin') OR public.has_role(uid,'moderator');
  IF NOT is_mod THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF _status NOT IN ('queued','processing','handled','rejected') THEN
    RAISE EXCEPTION 'invalid_status';
  END IF;

  UPDATE public.live_battle_reports
     SET status = _status,
         handled_at = CASE WHEN _status IN ('handled','rejected') THEN now() ELSE NULL END,
         handled_by = CASE WHEN _status IN ('handled','rejected') THEN uid ELSE NULL END
   WHERE id = _report_id
  RETURNING * INTO row;
  IF NOT FOUND THEN RAISE EXCEPTION 'report_not_found'; END IF;

  -- Best-effort audit
  BEGIN
    INSERT INTO public.admin_audit_log(actor_id, action, target_id, details)
    VALUES (uid, 'live_battle_report_' || _status, _report_id,
      jsonb_build_object('battle_id', row.battle_id, 'reporter_id', row.reporter_id));
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN row;
END; $$;
REVOKE ALL ON FUNCTION public.admin_update_live_battle_report_status(UUID,TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_live_battle_report_status(UUID,TEXT) TO authenticated;
