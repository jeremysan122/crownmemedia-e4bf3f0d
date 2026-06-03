
-- Legal acceptances (per user, per document, per version)
CREATE TABLE IF NOT EXISTS public.user_legal_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  doc_slug text NOT NULL,
  version text NOT NULL,
  last_updated text,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  source text,
  user_agent text,
  UNIQUE (user_id, doc_slug, version)
);

CREATE INDEX IF NOT EXISTS user_legal_acceptances_user_idx ON public.user_legal_acceptances(user_id, accepted_at DESC);

GRANT SELECT, INSERT ON public.user_legal_acceptances TO authenticated;
GRANT ALL ON public.user_legal_acceptances TO service_role;

ALTER TABLE public.user_legal_acceptances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own acceptances"
  ON public.user_legal_acceptances FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can record their own acceptances"
  ON public.user_legal_acceptances FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Moderators can view all acceptances"
  ON public.user_legal_acceptances FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator'));

-- Sensitive content appeals (DSA-style notice & action)
DO $$ BEGIN
  CREATE TYPE public.sensitive_appeal_status AS ENUM ('pending','under_review','approved','denied','withdrawn');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.sensitive_appeals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  post_id uuid,
  decision_type text NOT NULL DEFAULT 'sensitive_label',
  user_statement text NOT NULL,
  status public.sensitive_appeal_status NOT NULL DEFAULT 'pending',
  moderator_notes text,
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sensitive_appeals_user_idx ON public.sensitive_appeals(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS sensitive_appeals_status_idx ON public.sensitive_appeals(status, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.sensitive_appeals TO authenticated;
GRANT ALL ON public.sensitive_appeals TO service_role;

ALTER TABLE public.sensitive_appeals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own appeals"
  ON public.sensitive_appeals FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Mods view all appeals"
  ON public.sensitive_appeals FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator'));

CREATE POLICY "Users create own appeals"
  ON public.sensitive_appeals FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can withdraw own appeals"
  ON public.sensitive_appeals FOR UPDATE TO authenticated
  USING (auth.uid() = user_id AND status IN ('pending','under_review'))
  WITH CHECK (auth.uid() = user_id AND status = 'withdrawn');

CREATE POLICY "Mods decide appeals"
  ON public.sensitive_appeals FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator'));

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_sensitive_appeals()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS sensitive_appeals_touch ON public.sensitive_appeals;
CREATE TRIGGER sensitive_appeals_touch BEFORE UPDATE ON public.sensitive_appeals
  FOR EACH ROW EXECUTE FUNCTION public.touch_sensitive_appeals();
