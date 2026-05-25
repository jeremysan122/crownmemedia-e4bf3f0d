-- Cross-session photo dedupe (per user)
CREATE TABLE IF NOT EXISTS public.media_hashes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  hash TEXT NOT NULL,
  post_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, hash)
);
CREATE INDEX IF NOT EXISTS idx_media_hashes_user ON public.media_hashes (user_id);
CREATE INDEX IF NOT EXISTS idx_media_hashes_post ON public.media_hashes (post_id);

ALTER TABLE public.media_hashes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view their own media hashes"
  ON public.media_hashes FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert their own media hashes"
  ON public.media_hashes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins view all media hashes"
  ON public.media_hashes FOR SELECT
  USING (public.is_any_admin(auth.uid()));

-- Moderation audit log
CREATE TABLE IF NOT EXISTS public.moderation_audit (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('photo','video')),
  safe BOOLEAN NOT NULL,
  category TEXT NOT NULL,
  confidence NUMERIC,
  reason TEXT,
  image_urls TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_moderation_audit_user ON public.moderation_audit (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_moderation_audit_unsafe ON public.moderation_audit (created_at DESC) WHERE safe = false;

ALTER TABLE public.moderation_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view moderation audit"
  ON public.moderation_audit FOR SELECT
  USING (public.is_any_admin(auth.uid()));

-- Note: inserts come from the moderate-media edge function via service role; no INSERT policy needed for users.

-- Media origin tagging on posts
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='posts' AND column_name='media_origin'
  ) THEN
    ALTER TABLE public.posts
      ADD COLUMN media_origin TEXT
      CHECK (media_origin IN ('camera','gallery','paste','import') OR media_origin IS NULL);
  END IF;
END $$;