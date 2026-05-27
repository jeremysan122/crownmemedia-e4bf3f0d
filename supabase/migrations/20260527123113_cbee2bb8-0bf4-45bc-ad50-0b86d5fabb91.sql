
DROP POLICY IF EXISTS "Users subscribe to own topic only" ON realtime.messages;
CREATE POLICY "Users subscribe to own topic only"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  (
    extension = 'postgres_changes'
    AND realtime.topic() ~ ('(^|[-:])' || (auth.uid())::text || '([-:]|$)')
  )
  OR (
    extension <> 'postgres_changes'
    AND realtime.topic() = (auth.uid())::text
  )
);

REVOKE UPDATE ON public.verification_requests FROM authenticated, anon;
GRANT UPDATE (
  plan,
  legal_name,
  category,
  brand_name,
  website_url,
  social_links,
  follower_count,
  reason,
  id_document_path,
  business_document_path,
  selfie_path
) ON public.verification_requests TO authenticated;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS pronouns text;
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_pronouns_len;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_pronouns_len CHECK (pronouns IS NULL OR char_length(pronouns) <= 30);
