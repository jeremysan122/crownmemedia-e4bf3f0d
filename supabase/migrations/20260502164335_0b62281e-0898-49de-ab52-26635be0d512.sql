CREATE OR REPLACE FUNCTION public.votes_rate_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recent int;
  v_last timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF public.has_role(auth.uid(), 'admin'::app_role)
     OR public.has_role(auth.uid(), 'moderator'::app_role) THEN
    RETURN NEW;
  END IF;

  SELECT count(*), max(created_at)
    INTO v_recent, v_last
    FROM public.votes
    WHERE user_id = auth.uid()
      AND post_id = NEW.post_id
      AND created_at > now() - interval '30 seconds';

  IF v_recent >= 6 THEN
    RAISE EXCEPTION 'Vote rate limit reached on this post — slow down';
  END IF;
  IF v_last IS NOT NULL AND v_last > now() - interval '500 milliseconds' THEN
    RAISE EXCEPTION 'You are voting too fast — wait a moment';
  END IF;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS votes_rate_limit_trg ON public.votes;
CREATE TRIGGER votes_rate_limit_trg
BEFORE INSERT ON public.votes
FOR EACH ROW
EXECUTE FUNCTION public.votes_rate_limit();