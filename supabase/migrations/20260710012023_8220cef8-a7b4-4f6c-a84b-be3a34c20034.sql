
ALTER TABLE public.live_battle_reports
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','processing','handled','rejected')),
  ADD COLUMN IF NOT EXISTS handled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS handled_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS lbr_reporter_battle_idx
  ON public.live_battle_reports (reporter_id, battle_id, created_at DESC);

DROP FUNCTION IF EXISTS public.live_battle_report(UUID, TEXT);

CREATE FUNCTION public.live_battle_report(_battle_id UUID, _reason TEXT)
RETURNS public.live_battle_reports
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid UUID := auth.uid();
  new_row public.live_battle_reports;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _reason IS NULL OR char_length(trim(_reason)) < 5 THEN
    RAISE EXCEPTION 'invalid_reason';
  END IF;

  PERFORM public.enforce_rate_limit('livebattle:report', 10, 3600);

  IF NOT EXISTS(SELECT 1 FROM public.live_battles WHERE id = _battle_id) THEN
    RAISE EXCEPTION 'battle_not_found';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.live_battle_reports
    WHERE battle_id = _battle_id
      AND reporter_id = uid
      AND created_at > now() - interval '10 minutes'
  ) THEN
    RAISE EXCEPTION 'duplicate_report';
  END IF;

  INSERT INTO public.live_battle_reports(battle_id, reporter_id, reason)
  VALUES (_battle_id, uid, substring(_reason from 1 for 500))
  RETURNING * INTO new_row;

  RETURN new_row;
END; $$;
REVOKE ALL ON FUNCTION public.live_battle_report(UUID,TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.live_battle_report(UUID,TEXT) TO authenticated;

DO $$ BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.live_battle_reports;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.live_battle_participants;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

ALTER TABLE public.live_battle_reports REPLICA IDENTITY FULL;
ALTER TABLE public.live_battle_participants REPLICA IDENTITY FULL;
