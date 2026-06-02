
-- Sensitive content support
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS is_sensitive boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sensitive_reason text;

CREATE INDEX IF NOT EXISTS idx_posts_is_sensitive ON public.posts(is_sensitive) WHERE is_sensitive = true;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS sensitive_content_mode text NOT NULL DEFAULT 'blur';

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_sensitive_content_mode_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_sensitive_content_mode_check
  CHECK (sensitive_content_mode IN ('blur','show','hide'));
