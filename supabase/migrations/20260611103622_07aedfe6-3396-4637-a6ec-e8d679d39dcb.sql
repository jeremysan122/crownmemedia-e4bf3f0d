
-- 1) email_unsubscribe_tokens: revoke all client-role privileges (service_role only)
REVOKE ALL ON public.email_unsubscribe_tokens FROM anon, authenticated;

-- Defense-in-depth: explicit restrictive deny for non-service roles
DROP POLICY IF EXISTS "Deny anon/authenticated all access" ON public.email_unsubscribe_tokens;
CREATE POLICY "Deny anon/authenticated all access"
ON public.email_unsubscribe_tokens
AS RESTRICTIVE
FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);

-- 2) battle_votes: lock down anon (table has NOT NULL user_id, but be explicit)
REVOKE ALL ON public.battle_votes FROM anon;
GRANT SELECT, INSERT ON public.battle_votes TO authenticated;

DROP POLICY IF EXISTS "Users vote in battles as themselves" ON public.battle_votes;
CREATE POLICY "Users vote in battles as themselves"
ON public.battle_votes
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- 3) profiles: hide moderation-internal fields from anon and authenticated reads
REVOKE SELECT (banned_at, is_suspended) ON public.profiles FROM anon, authenticated;
