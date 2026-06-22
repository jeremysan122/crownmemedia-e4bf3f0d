
CREATE TABLE IF NOT EXISTS public.post_media_ai_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  media_urls TEXT[] NOT NULL DEFAULT '{}'::text[],
  model_name TEXT NOT NULL DEFAULT 'google/gemini-2.5-flash',
  analysis_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (analysis_status IN ('pending','complete','failed','needs_review')),
  safety_status TEXT NOT NULL DEFAULT 'safe'
    CHECK (safety_status IN ('safe','sensitive','blocked','needs_review')),
  confidence_score NUMERIC(4,3),
  suggested_master_category TEXT,
  suggested_topic TEXT,
  detected_objects JSONB NOT NULL DEFAULT '[]'::jsonb,
  safety_flags JSONB NOT NULL DEFAULT '{}'::jsonb,
  extracted_text TEXT,
  detected_language TEXT,
  text_flags JSONB NOT NULL DEFAULT '{}'::jsonb,
  moderation_reason TEXT,
  raw_ai_response JSONB,
  duration_ms INTEGER,
  token_usage JSONB,
  retry_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT post_media_ai_analysis_post_unique UNIQUE (post_id)
);

CREATE INDEX IF NOT EXISTS idx_pmaa_post_id ON public.post_media_ai_analysis(post_id);
CREATE INDEX IF NOT EXISTS idx_pmaa_user_id ON public.post_media_ai_analysis(user_id);
CREATE INDEX IF NOT EXISTS idx_pmaa_analysis_status ON public.post_media_ai_analysis(analysis_status);
CREATE INDEX IF NOT EXISTS idx_pmaa_safety_status ON public.post_media_ai_analysis(safety_status);
CREATE INDEX IF NOT EXISTS idx_pmaa_master_category ON public.post_media_ai_analysis(suggested_master_category);
CREATE INDEX IF NOT EXISTS idx_pmaa_created_at ON public.post_media_ai_analysis(created_at DESC);

GRANT SELECT ON public.post_media_ai_analysis TO authenticated;
GRANT ALL ON public.post_media_ai_analysis TO service_role;

ALTER TABLE public.post_media_ai_analysis ENABLE ROW LEVEL SECURITY;

-- Only admins/moderators can read raw AI analysis rows.
CREATE POLICY "Admins and moderators can view AI analysis"
  ON public.post_media_ai_analysis
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'moderator'::app_role)
  );

-- No INSERT/UPDATE/DELETE policies for authenticated users.
-- Service role (edge functions) bypasses RLS and is the only writer.

CREATE OR REPLACE FUNCTION public.update_pmaa_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pmaa_updated_at ON public.post_media_ai_analysis;
CREATE TRIGGER trg_pmaa_updated_at
  BEFORE UPDATE ON public.post_media_ai_analysis
  FOR EACH ROW EXECUTE FUNCTION public.update_pmaa_updated_at();
