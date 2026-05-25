-- Fix #1: Appeal INSERT policy was inverted — reported user (or affected commenter/post owner) should appeal, not the reporter.
DROP POLICY IF EXISTS "Appeals: author submits own appeal" ON public.report_appeals;

CREATE POLICY "Appeals: subject submits own appeal"
ON public.report_appeals
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND length(body) >= 20
  AND length(body) <= 2000
  AND EXISTS (
    SELECT 1 FROM public.reports r
    WHERE r.id = report_appeals.report_id
      AND (
        -- The reported user themselves
        r.reported_user_id = auth.uid()
        -- Or the owner of the reported post
        OR EXISTS (SELECT 1 FROM public.posts p WHERE p.id = r.post_id AND p.user_id = auth.uid())
        -- Or the author of the reported comment
        OR EXISTS (SELECT 1 FROM public.comments c WHERE c.id = r.comment_id AND c.user_id = auth.uid())
      )
  )
);

-- Fix #2: Make dm-attachments UPDATE deny explicit and immutable via a RESTRICTIVE policy.
DROP POLICY IF EXISTS "DM attachments are immutable" ON storage.objects;
CREATE POLICY "DM attachments are immutable"
ON storage.objects
AS RESTRICTIVE
FOR UPDATE
TO authenticated, anon
USING (bucket_id <> 'dm-attachments')
WITH CHECK (bucket_id <> 'dm-attachments');