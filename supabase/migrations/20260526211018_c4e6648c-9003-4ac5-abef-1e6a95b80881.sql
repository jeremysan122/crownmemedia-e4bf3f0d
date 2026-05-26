CREATE OR REPLACE FUNCTION public.enforce_video_duration_cap()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.media_type = 'video' THEN
    IF NEW.duration_ms IS NULL THEN
      RAISE EXCEPTION 'Video posts must include duration_ms';
    END IF;
    IF NEW.duration_ms > 30000 THEN
      RAISE EXCEPTION 'Video posts must be 30 seconds or less (got % ms)', NEW.duration_ms;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_video_duration ON public.posts;
CREATE TRIGGER trg_enforce_video_duration
BEFORE INSERT OR UPDATE ON public.posts
FOR EACH ROW
EXECUTE FUNCTION public.enforce_video_duration_cap();