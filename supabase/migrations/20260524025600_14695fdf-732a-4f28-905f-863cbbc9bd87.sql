-- Harden email queue helper functions: set immutable search_path and revoke
-- execute from anon/authenticated. They are only meant to be invoked by
-- service-role edge functions (process-email-queue, send-transactional-email).

ALTER FUNCTION public.enqueue_email(text, jsonb)   SET search_path = public, pg_temp;
ALTER FUNCTION public.delete_email(text, bigint)   SET search_path = public, pg_temp;
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = public, pg_temp;
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb)   SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb)   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint)   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb)   FROM PUBLIC, anon, authenticated;

-- Tighten anon access on SECURITY DEFINER helpers that don't need it.
REVOKE EXECUTE ON FUNCTION public.is_feature_enabled(text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.posts_notify_tagged()    FROM anon, authenticated, PUBLIC;