
CREATE TABLE IF NOT EXISTS public.feature_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  enabled boolean NOT NULL DEFAULT false,
  description text,
  rollout_percent integer NOT NULL DEFAULT 100 CHECK (rollout_percent BETWEEN 0 AND 100),
  audience text NOT NULL DEFAULT 'all' CHECK (audience IN ('all','admins','royal_pass')),
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "flags readable by authed" ON public.feature_flags;
CREATE POLICY "flags readable by authed" ON public.feature_flags
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "flags admin insert" ON public.feature_flags;
CREATE POLICY "flags admin insert" ON public.feature_flags
  FOR INSERT TO authenticated
  WITH CHECK (public.is_any_admin(auth.uid()));

DROP POLICY IF EXISTS "flags admin update" ON public.feature_flags;
CREATE POLICY "flags admin update" ON public.feature_flags
  FOR UPDATE TO authenticated
  USING (public.is_any_admin(auth.uid()))
  WITH CHECK (public.is_any_admin(auth.uid()));

DROP POLICY IF EXISTS "flags admin delete" ON public.feature_flags;
CREATE POLICY "flags admin delete" ON public.feature_flags
  FOR DELETE TO authenticated
  USING (public.is_any_admin(auth.uid()));

DROP TRIGGER IF EXISTS touch_feature_flags ON public.feature_flags;
CREATE TRIGGER touch_feature_flags BEFORE UPDATE ON public.feature_flags
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.is_feature_enabled(_key text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_flag public.feature_flags%ROWTYPE;
  v_uid uuid := auth.uid();
  v_is_admin boolean := false;
  v_is_royal boolean := false;
  v_bucket int;
BEGIN
  SELECT * INTO v_flag FROM public.feature_flags WHERE key = _key;
  IF NOT FOUND THEN RETURN false; END IF;
  IF NOT v_flag.enabled THEN RETURN false; END IF;

  IF v_uid IS NOT NULL THEN
    v_is_admin := public.is_any_admin(v_uid);
    v_is_royal := public.is_royal_pass_active(v_uid);
  END IF;

  IF v_flag.audience = 'admins' AND NOT v_is_admin THEN RETURN false; END IF;
  IF v_flag.audience = 'royal_pass' AND NOT v_is_royal AND NOT v_is_admin THEN RETURN false; END IF;

  IF v_flag.rollout_percent >= 100 THEN RETURN true; END IF;
  IF v_flag.rollout_percent <= 0 THEN RETURN v_is_admin; END IF;

  v_bucket := (abs(hashtext(coalesce(v_uid::text,'anon') || ':' || _key)) % 100);
  RETURN v_bucket < v_flag.rollout_percent;
END $$;

REVOKE ALL ON FUNCTION public.is_feature_enabled(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_feature_enabled(text) TO authenticated;
