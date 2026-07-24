-- Emergency compatibility rollback for 20260722160000.
--
-- This intentionally does NOT restore the unsafe broad profile/post SELECT
-- grants, precise coordinate exposure, PUBLIC function execution, or direct
-- financial writes. It only restores the legacy direct-follow client path and
-- pre-revision DM/comment/vote behavior long enough to roll the client back.
-- Follow-request rows are preserved so no user decision data is destroyed.

BEGIN;

DROP TRIGGER IF EXISTS trg_messages_enforce_social_permissions ON public.messages;
DROP POLICY IF EXISTS "Users send permitted DMs as themselves" ON public.messages;
CREATE POLICY "Users send DMs as themselves"
ON public.messages FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = sender_id
  AND kind = 'text'
  AND gift_transaction_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.blocks b
     WHERE (b.blocker_id = receiver_id AND b.blocked_id = auth.uid())
        OR (b.blocker_id = auth.uid() AND b.blocked_id = receiver_id)
  )
);

DROP TRIGGER IF EXISTS trg_follows_enforce_approved_relationship ON public.follows;
DROP POLICY IF EXISTS "follow graph visible by relationship privacy" ON public.follows;
DROP POLICY IF EXISTS "anonymous follow graph visible by relationship privacy" ON public.follows;
DROP POLICY IF EXISTS "authenticated follow graph visible by relationship privacy" ON public.follows;
CREATE POLICY "Follows viewable by everyone" ON public.follows FOR SELECT USING (true);
CREATE POLICY "Users can follow as themselves" ON public.follows
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = follower_id);
CREATE POLICY "Users can unfollow themselves" ON public.follows
  FOR DELETE TO authenticated USING (auth.uid() = follower_id);
GRANT SELECT, INSERT, DELETE ON public.follows TO authenticated;
GRANT SELECT ON public.follows TO anon;

DROP POLICY IF EXISTS "comments inherit visible parent" ON public.comments;
DROP POLICY IF EXISTS "anonymous comments inherit visible parent" ON public.comments;
DROP POLICY IF EXISTS "authenticated comments inherit visible parent" ON public.comments;
DROP POLICY IF EXISTS "comments insert on visible parent" ON public.comments;
CREATE POLICY "Comments viewable by everyone" ON public.comments FOR SELECT
  USING (NOT is_removed OR auth.uid() = user_id OR public.has_role(auth.uid(), 'moderator'));
CREATE POLICY "Users can comment as themselves" ON public.comments FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "votes insert on visible parent" ON public.votes;
CREATE POLICY "Users can vote as themselves" ON public.votes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

NOTIFY pgrst, 'reload schema';
COMMIT;
