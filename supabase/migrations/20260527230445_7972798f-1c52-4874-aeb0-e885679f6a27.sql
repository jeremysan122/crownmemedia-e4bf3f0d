
-- 1. Realtime DM typing: require pair membership + no block between the two users
CREATE OR REPLACE FUNCTION public.dm_typing_topic_allowed(_topic text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  parts text[];
  a uuid;
  b uuid;
  me uuid := auth.uid();
BEGIN
  IF me IS NULL OR _topic IS NULL OR _topic NOT LIKE 'dm-typing:%' THEN
    RETURN false;
  END IF;
  parts := string_to_array(split_part(_topic, ':', 2), '__');
  IF parts IS NULL OR array_length(parts, 1) <> 2 THEN
    RETURN false;
  END IF;
  BEGIN
    a := parts[1]::uuid;
    b := parts[2]::uuid;
  EXCEPTION WHEN others THEN
    RETURN false;
  END;
  IF me <> a AND me <> b THEN
    RETURN false;
  END IF;
  -- Block check both directions
  IF EXISTS (
    SELECT 1 FROM public.blocks
    WHERE (blocker_id = a AND blocked_id = b)
       OR (blocker_id = b AND blocked_id = a)
  ) THEN
    RETURN false;
  END IF;
  RETURN true;
END
$$;

GRANT EXECUTE ON FUNCTION public.dm_typing_topic_allowed(text) TO authenticated;

DROP POLICY IF EXISTS "Users send to own topic only" ON realtime.messages;
CREATE POLICY "Users send to own topic only"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (
  (extension = ANY (ARRAY['broadcast'::text, 'presence'::text]))
  AND (
    realtime.topic() = (auth.uid())::text
    OR (
      realtime.topic() LIKE 'dm-typing:%'
      AND public.dm_typing_topic_allowed(realtime.topic())
    )
  )
);

-- 2. Verification requests: column-level grants so users cannot UPDATE admin fields
REVOKE UPDATE ON public.verification_requests FROM authenticated;
GRANT UPDATE (
  legal_name,
  category,
  brand_name,
  website_url,
  social_links,
  follower_count,
  reason,
  id_document_path,
  business_document_path,
  selfie_path,
  updated_at
) ON public.verification_requests TO authenticated;
-- Admins act via SECURITY DEFINER RPC (admin_decide_verification); service_role retains full access.

-- Tighten RLS WITH CHECK so a non-admin user can never leave admin-controlled
-- fields in any state other than the safe defaults via the user-update policy.
DROP POLICY IF EXISTS "user updates own pending request" ON public.verification_requests;
CREATE POLICY "user updates own pending request"
ON public.verification_requests
FOR UPDATE
TO authenticated
USING (
  auth.uid() = user_id
  AND status = ANY (ARRAY['pending'::verification_status, 'more_info_required'::verification_status])
)
WITH CHECK (
  auth.uid() = user_id
  AND status = ANY (ARRAY['pending'::verification_status, 'more_info_required'::verification_status])
);
