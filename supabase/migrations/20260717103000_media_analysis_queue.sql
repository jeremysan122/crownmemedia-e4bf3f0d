-- Durable retry queue for post-publish media analysis. Publishing creates the
-- job transactionally; the browser may accelerate it, but is never the only
-- actor responsible for moderation completion.

CREATE TABLE IF NOT EXISTS public.post_media_analysis_jobs (
  post_id uuid PRIMARY KEY REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','complete','failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS post_media_analysis_jobs_due
  ON public.post_media_analysis_jobs(next_attempt_at, status)
  WHERE status IN ('pending','processing');

ALTER TABLE public.post_media_analysis_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.post_media_analysis_jobs FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.post_media_analysis_jobs TO service_role;

CREATE OR REPLACE FUNCTION public.claim_post_media_analysis_jobs(_limit integer DEFAULT 10)
RETURNS TABLE(post_id uuid, user_id uuid)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH due AS (
    SELECT j.post_id
      FROM public.post_media_analysis_jobs j
     WHERE j.attempts < 10
       AND j.next_attempt_at <= now()
       AND (
         j.status = 'pending'
         OR (j.status = 'processing' AND j.started_at < now() - interval '10 minutes')
       )
     ORDER BY j.next_attempt_at, j.created_at
     FOR UPDATE SKIP LOCKED
     LIMIT LEAST(GREATEST(COALESCE(_limit, 10), 1), 25)
  )
  UPDATE public.post_media_analysis_jobs j
     SET status = 'processing',
         attempts = attempts + 1,
         started_at = now(),
         last_error = NULL,
         updated_at = now()
    FROM due
   WHERE j.post_id = due.post_id
  RETURNING j.post_id, j.user_id;
$$;

CREATE OR REPLACE FUNCTION public.complete_post_media_analysis_job(_post_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.post_media_analysis_jobs
     SET status = 'complete', completed_at = now(), last_error = NULL, updated_at = now()
   WHERE post_id = _post_id;
$$;

CREATE OR REPLACE FUNCTION public.fail_post_media_analysis_job(_post_id uuid, _error text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.post_media_analysis_jobs
     SET status = CASE WHEN attempts >= 10 THEN 'failed' ELSE 'pending' END,
         started_at = NULL,
         next_attempt_at = now() + make_interval(secs => LEAST(21600, 30 * (2 ^ LEAST(attempts, 9))::integer)),
         last_error = left(COALESCE(_error, 'analysis failed'), 2000),
         updated_at = now()
   WHERE post_id = _post_id;
$$;

REVOKE ALL ON FUNCTION public.claim_post_media_analysis_jobs(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_post_media_analysis_job(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_post_media_analysis_job(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_post_media_analysis_jobs(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_post_media_analysis_job(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_post_media_analysis_job(uuid, text) TO service_role;

NOTIFY pgrst, 'reload schema';
