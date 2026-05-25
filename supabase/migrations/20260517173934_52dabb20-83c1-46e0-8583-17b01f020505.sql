
-- 1. Restrict votes SELECT to authenticated users only
DROP POLICY IF EXISTS "Votes are viewable by everyone" ON public.votes;
CREATE POLICY "Votes are viewable by authenticated users"
  ON public.votes FOR SELECT
  TO authenticated
  USING (true);

-- 2. Hide first_name / last_name from anonymous visitors via column-level grants.
-- The existing public SELECT policy on profiles continues to expose other public
-- fields (username, avatar, bio, counters). Anon attempting to select these two
-- columns will be denied at the grant layer; authenticated callers retain access.
REVOKE SELECT (first_name, last_name) ON public.profiles FROM anon;

-- 3. Lock down SECURITY DEFINER functions in public so anonymous callers
-- cannot probe them. RLS policies invoke them as the policy owner regardless,
-- so removing anon EXECUTE does not affect policy evaluation.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.can_view_posts_of(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.comments_allowed_on(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.cancel_account_deletion() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.deactivate_my_account() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.reactivate_my_account() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.request_account_deletion() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_posts_of(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.comments_allowed_on(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_account_deletion() TO authenticated;
GRANT EXECUTE ON FUNCTION public.deactivate_my_account() TO authenticated;
GRANT EXECUTE ON FUNCTION public.reactivate_my_account() TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_account_deletion() TO authenticated;

-- 4. Tighten realtime.messages so postgres_changes subscriptions are scoped
-- to topics that encode the subscribing user's own UUID. Other extension
-- types (broadcast/presence) keep the existing topic-equals-user rule.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'realtime' AND tablename = 'messages'
      AND policyname = 'Users subscribe to own topic only'
  ) THEN
    EXECUTE 'DROP POLICY "Users subscribe to own topic only" ON realtime.messages';
  END IF;

  EXECUTE $p$
    CREATE POLICY "Users subscribe to own topic only"
    ON realtime.messages
    FOR SELECT
    TO authenticated
    USING (
      (extension = 'postgres_changes' AND realtime.topic() LIKE '%' || auth.uid()::text || '%')
      OR (extension <> 'postgres_changes' AND realtime.topic() = auth.uid()::text)
    )
  $p$;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'Skipping realtime.messages policy update (insufficient privilege)';
END $$;
