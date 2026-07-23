-- Restore authenticated SELECT on profiles/posts. Anon remains locked out and
-- must continue to use posts_public / profiles_public. The prior lockdown
-- migrations accidentally revoked SELECT for BOTH roles, which broke:
--   * Profile save (RLS/trigger reads on profiles),
--   * Live battle accept/decline/cancel (post-RPC re-reads + profile joins),
--   * Vote toggling (recalc_post_score trigger SELECTs posts/votes as invoker).
--
-- Anon privacy guarantees (no raw posts/profiles access, no coords, no
-- moderation internals, no PII) are unaffected: anon still has zero SELECT
-- on these base tables.

GRANT SELECT ON public.profiles TO authenticated;
GRANT SELECT ON public.posts TO authenticated;

-- Ensure the safe public views remain readable by anon (idempotent).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_views WHERE schemaname='public' AND viewname='profiles_public') THEN
    EXECUTE 'GRANT SELECT ON public.profiles_public TO anon, authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_views WHERE schemaname='public' AND viewname='posts_public') THEN
    EXECUTE 'GRANT SELECT ON public.posts_public TO anon, authenticated';
  END IF;
END$$;

-- Belt-and-braces: confirm anon still has no direct SELECT on the base tables.
REVOKE SELECT ON public.profiles FROM anon;
REVOKE SELECT ON public.posts FROM anon;