CREATE TABLE public.profile_visits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id UUID NOT NULL,
  visitor_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_profile_visits_profile_created ON public.profile_visits (profile_id, created_at DESC);
CREATE INDEX idx_profile_visits_visitor_profile ON public.profile_visits (visitor_id, profile_id, created_at DESC);

GRANT SELECT, INSERT ON public.profile_visits TO authenticated;
GRANT ALL ON public.profile_visits TO service_role;

ALTER TABLE public.profile_visits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can read their visits"
  ON public.profile_visits FOR SELECT TO authenticated
  USING (auth.uid() = profile_id);

CREATE POLICY "Authenticated users can insert via rpc only"
  ON public.profile_visits FOR INSERT TO authenticated
  WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.record_profile_visit(_profile_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid(); v_recent timestamptz;
BEGIN
  IF v_uid IS NULL OR v_uid = _profile_id OR _profile_id IS NULL THEN RETURN; END IF;
  SELECT max(created_at) INTO v_recent FROM public.profile_visits
    WHERE profile_id = _profile_id AND visitor_id = v_uid
      AND created_at > now() - interval '30 minutes';
  IF v_recent IS NOT NULL THEN RETURN; END IF;
  INSERT INTO public.profile_visits (profile_id, visitor_id) VALUES (_profile_id, v_uid);
END $$;

REVOKE ALL ON FUNCTION public.record_profile_visit(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_profile_visit(uuid) TO authenticated;