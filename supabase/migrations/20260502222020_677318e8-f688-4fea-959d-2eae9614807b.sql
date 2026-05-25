-- Extend report_status enum (add new values; keeps existing 'open','resolved','dismissed')
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'action_taken' AND enumtypid = 'public.report_status'::regtype) THEN
    ALTER TYPE public.report_status ADD VALUE 'action_taken';
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'denied' AND enumtypid = 'public.report_status'::regtype) THEN
    ALTER TYPE public.report_status ADD VALUE 'denied';
  END IF;
END $$;

-- Reports: richer reporting metadata
ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS reason_code text,
  ADD COLUMN IF NOT EXISTS mod_notes text,
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz;

-- Appeals table
CREATE TABLE IF NOT EXISTS public.report_appeals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL,
  user_id uuid NOT NULL,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'pending', -- pending | upheld | overturned
  mod_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_report_appeals_user ON public.report_appeals(user_id);
CREATE INDEX IF NOT EXISTS idx_report_appeals_report ON public.report_appeals(report_id);

ALTER TABLE public.report_appeals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own appeals" ON public.report_appeals;
CREATE POLICY "Users view own appeals" ON public.report_appeals
  FOR SELECT USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'moderator'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Users create own appeals" ON public.report_appeals;
CREATE POLICY "Users create own appeals" ON public.report_appeals
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND length(body) BETWEEN 20 AND 2000
    AND EXISTS (
      SELECT 1 FROM public.reports r
      WHERE r.id = report_id
        AND r.reporter_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Mods update appeals" ON public.report_appeals;
CREATE POLICY "Mods update appeals" ON public.report_appeals
  FOR UPDATE USING (public.has_role(auth.uid(), 'moderator'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'moderator'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER report_appeals_touch
  BEFORE UPDATE ON public.report_appeals
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();