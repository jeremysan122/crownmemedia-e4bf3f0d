-- Make avatar storage ownership checks resilient by using direct path matching.
-- This avoids intermittent failures where folder helper checks reject valid own-folder uploads.

CREATE POLICY "Avatar owner upload direct path"
ON storage.objects
FOR INSERT
TO public
WITH CHECK (
  bucket_id = 'avatars'
  AND auth.uid() IS NOT NULL
  AND name LIKE auth.uid()::text || '/%'
);

CREATE POLICY "Avatar owner update direct path"
ON storage.objects
FOR UPDATE
TO public
USING (
  bucket_id = 'avatars'
  AND auth.uid() IS NOT NULL
  AND name LIKE auth.uid()::text || '/%'
)
WITH CHECK (
  bucket_id = 'avatars'
  AND auth.uid() IS NOT NULL
  AND name LIKE auth.uid()::text || '/%'
);

CREATE POLICY "Avatar owner delete direct path"
ON storage.objects
FOR DELETE
TO public
USING (
  bucket_id = 'avatars'
  AND auth.uid() IS NOT NULL
  AND name LIKE auth.uid()::text || '/%'
);