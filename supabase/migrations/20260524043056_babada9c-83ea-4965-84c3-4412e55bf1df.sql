
-- Tighten error_logs anonymous + authenticated insert policies with length limits to prevent storage flooding.

DROP POLICY IF EXISTS "Anonymous users can insert error logs" ON public.error_logs;
DROP POLICY IF EXISTS "Users can insert their own error logs" ON public.error_logs;

CREATE POLICY "Anonymous users can insert error logs"
ON public.error_logs
FOR INSERT
TO anon
WITH CHECK (
  user_id IS NULL
  AND length(coalesce(message, '')) <= 2000
  AND length(coalesce(stack, '')) <= 8000
  AND octet_length(coalesce(metadata::text, '')) <= 4096
);

CREATE POLICY "Users can insert their own error logs"
ON public.error_logs
FOR INSERT
TO authenticated
WITH CHECK (
  (user_id IS NULL OR user_id = auth.uid())
  AND length(coalesce(message, '')) <= 2000
  AND length(coalesce(stack, '')) <= 8000
  AND octet_length(coalesce(metadata::text, '')) <= 4096
);
