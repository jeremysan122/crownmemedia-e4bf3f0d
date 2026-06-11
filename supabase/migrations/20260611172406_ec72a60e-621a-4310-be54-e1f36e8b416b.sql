DROP POLICY IF EXISTS "messages: recipient cannot mutate content" ON public.messages;

CREATE POLICY "messages: recipient cannot mutate content"
ON public.messages
AS RESTRICTIVE
FOR UPDATE
TO public
USING (true)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'moderator'::app_role)
  OR (
    sender_id        = (SELECT m.sender_id        FROM public.messages m WHERE m.id = messages.id)
    AND receiver_id  = (SELECT m.receiver_id      FROM public.messages m WHERE m.id = messages.id)
    AND body         IS NOT DISTINCT FROM (SELECT m.body              FROM public.messages m WHERE m.id = messages.id)
    AND shared_post_id    IS NOT DISTINCT FROM (SELECT m.shared_post_id    FROM public.messages m WHERE m.id = messages.id)
    AND shared_profile_id IS NOT DISTINCT FROM (SELECT m.shared_profile_id FROM public.messages m WHERE m.id = messages.id)
    AND attachment_path   IS NOT DISTINCT FROM (SELECT m.attachment_path   FROM public.messages m WHERE m.id = messages.id)
    AND attachment_name   IS NOT DISTINCT FROM (SELECT m.attachment_name   FROM public.messages m WHERE m.id = messages.id)
    AND attachment_size   IS NOT DISTINCT FROM (SELECT m.attachment_size   FROM public.messages m WHERE m.id = messages.id)
    AND attachment_type   IS NOT DISTINCT FROM (SELECT m.attachment_type   FROM public.messages m WHERE m.id = messages.id)
    AND created_at        = (SELECT m.created_at  FROM public.messages m WHERE m.id = messages.id)
  )
);