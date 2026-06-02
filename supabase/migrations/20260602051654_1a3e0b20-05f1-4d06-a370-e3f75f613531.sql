-- Enums
DO $$ BEGIN
  CREATE TYPE public.content_rating AS ENUM ('safe','suggestive','mature','explicit');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.moderation_status AS ENUM ('pending','approved','flagged','removed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Columns
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS content_rating public.content_rating NOT NULL DEFAULT 'safe',
  ADD COLUMN IF NOT EXISTS moderation_status public.moderation_status NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS moderation_notes text,
  ADD COLUMN IF NOT EXISTS moderated_by uuid,
  ADD COLUMN IF NOT EXISTS moderated_at timestamptz;

-- Backfill: sensitive posts default to mature
UPDATE public.posts
SET content_rating = 'mature'
WHERE is_sensitive = true AND content_rating = 'safe';

CREATE INDEX IF NOT EXISTS idx_posts_moderation_status ON public.posts(moderation_status) WHERE moderation_status <> 'approved';
CREATE INDEX IF NOT EXISTS idx_posts_content_rating ON public.posts(content_rating) WHERE content_rating <> 'safe';

-- Trigger: prevent non-admin/mod from changing moderation fields
CREATE OR REPLACE FUNCTION public.guard_posts_moderation_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_privileged boolean;
BEGIN
  is_privileged := public.has_role(auth.uid(), 'admin'::app_role)
                OR public.has_role(auth.uid(), 'moderator'::app_role);

  IF NOT is_privileged THEN
    IF NEW.moderation_status IS DISTINCT FROM OLD.moderation_status THEN
      RAISE EXCEPTION 'Only moderators can change moderation_status';
    END IF;
    IF NEW.moderation_notes IS DISTINCT FROM OLD.moderation_notes THEN
      RAISE EXCEPTION 'Only moderators can change moderation_notes';
    END IF;
    IF NEW.moderated_by IS DISTINCT FROM OLD.moderated_by THEN
      RAISE EXCEPTION 'Only moderators can change moderated_by';
    END IF;
    IF NEW.moderated_at IS DISTINCT FROM OLD.moderated_at THEN
      RAISE EXCEPTION 'Only moderators can change moderated_at';
    END IF;
    -- Authors may set content_rating on their own posts up to 'mature'; only mods can mark 'explicit'
    IF NEW.content_rating = 'explicit' AND OLD.content_rating IS DISTINCT FROM 'explicit' THEN
      RAISE EXCEPTION 'Only moderators can mark content as explicit';
    END IF;
  ELSE
    -- Auto-stamp moderation metadata when a moderator changes status
    IF NEW.moderation_status IS DISTINCT FROM OLD.moderation_status THEN
      NEW.moderated_by := auth.uid();
      NEW.moderated_at := now();
      IF NEW.moderation_status = 'removed' THEN
        NEW.is_removed := true;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_posts_moderation_fields ON public.posts;
CREATE TRIGGER trg_guard_posts_moderation_fields
BEFORE UPDATE ON public.posts
FOR EACH ROW
EXECUTE FUNCTION public.guard_posts_moderation_fields();

-- Insert guard: non-privileged users cannot set non-default values on insert
CREATE OR REPLACE FUNCTION public.guard_posts_moderation_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_privileged boolean;
BEGIN
  is_privileged := public.has_role(auth.uid(), 'admin'::app_role)
                OR public.has_role(auth.uid(), 'moderator'::app_role);
  IF NOT is_privileged THEN
    NEW.moderation_status := 'approved';
    NEW.moderation_notes := NULL;
    NEW.moderated_by := NULL;
    NEW.moderated_at := NULL;
    IF NEW.content_rating = 'explicit' THEN
      NEW.content_rating := 'mature';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_posts_moderation_insert ON public.posts;
CREATE TRIGGER trg_guard_posts_moderation_insert
BEFORE INSERT ON public.posts
FOR EACH ROW
EXECUTE FUNCTION public.guard_posts_moderation_insert();
