
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS crown_score integer NOT NULL DEFAULT 0;

-- Backfill from posts
UPDATE public.profiles p
SET crown_score = COALESCE(sub.total, 0)
FROM (
  SELECT user_id, SUM(COALESCE(crown_score,0))::int AS total
  FROM public.posts
  WHERE user_id IS NOT NULL
  GROUP BY user_id
) sub
WHERE p.id = sub.user_id;

CREATE INDEX IF NOT EXISTS idx_profiles_crown_score ON public.profiles (crown_score DESC);

-- Trigger: keep profiles.crown_score in sync with posts.crown_score
CREATE OR REPLACE FUNCTION public.tg_sync_profile_crown_score()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  delta int := 0;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.user_id IS NOT NULL THEN
      UPDATE public.profiles SET crown_score = GREATEST(0, crown_score + COALESCE(NEW.crown_score,0))
      WHERE id = NEW.user_id;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.user_id IS NOT NULL THEN
      UPDATE public.profiles SET crown_score = GREATEST(0, crown_score - COALESCE(OLD.crown_score,0))
      WHERE id = OLD.user_id;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF COALESCE(NEW.crown_score,0) <> COALESCE(OLD.crown_score,0) OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
      IF OLD.user_id IS NOT NULL THEN
        UPDATE public.profiles SET crown_score = GREATEST(0, crown_score - COALESCE(OLD.crown_score,0))
        WHERE id = OLD.user_id;
      END IF;
      IF NEW.user_id IS NOT NULL THEN
        UPDATE public.profiles SET crown_score = GREATEST(0, crown_score + COALESCE(NEW.crown_score,0))
        WHERE id = NEW.user_id;
      END IF;
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS tg_sync_profile_crown_score ON public.posts;
CREATE TRIGGER tg_sync_profile_crown_score
AFTER INSERT OR UPDATE OR DELETE ON public.posts
FOR EACH ROW EXECUTE FUNCTION public.tg_sync_profile_crown_score();
