
DROP POLICY IF EXISTS "post_media viewable when post is viewable" ON public.post_media;
CREATE POLICY "post_media viewable when post is viewable"
ON public.post_media
FOR SELECT
TO authenticated
USING (
  deleted_at IS NULL
  AND EXISTS (
    SELECT 1 FROM public.posts p
    WHERE p.id = post_media.post_id
      AND p.is_removed = false
      AND p.moderation_status = 'approved'::moderation_status
      AND COALESCE(p.is_sensitive, false) = false
  )
);
