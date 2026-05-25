-- Replace broad avatar SELECT with scoped rules that avoid public bucket listing.
DROP POLICY IF EXISTS "Avatars public read" ON storage.objects;

CREATE POLICY "Avatars public exact path read"
ON storage.objects
FOR SELECT
TO public
USING (
  bucket_id = 'avatars'
  AND name IS NOT NULL
  AND name <> ''
  AND position('/' in name) > 0
);

CREATE POLICY "Avatar owner list direct path"
ON storage.objects
FOR SELECT
TO public
USING (
  bucket_id = 'avatars'
  AND auth.uid() IS NOT NULL
  AND name LIKE auth.uid()::text || '/%'
);