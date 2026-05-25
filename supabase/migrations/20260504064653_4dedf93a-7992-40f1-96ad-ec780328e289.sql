-- Block stored XSS via SVG/HTML uploads to public buckets.
-- RESTRICTIVE policies AND with permissive ones, so a safe-extension allowlist
-- is enforced on every INSERT/UPDATE regardless of which permissive policy matches.

DROP POLICY IF EXISTS "Public buckets safe extension allowlist insert" ON storage.objects;
DROP POLICY IF EXISTS "Public buckets safe extension allowlist update" ON storage.objects;

CREATE POLICY "Public buckets safe extension allowlist insert"
ON storage.objects
AS RESTRICTIVE
FOR INSERT
TO public
WITH CHECK (
  bucket_id NOT IN ('media','posts','banners','share-cards','avatars')
  OR (
    lower(storage.extension(name)) IN ('jpg','jpeg','png','webp','gif','heic','heif','mp4','webm','mov','m4v')
    AND (
      metadata IS NULL
      OR metadata->>'mimetype' IS NULL
      OR lower(metadata->>'mimetype') IN (
        'image/jpeg','image/jpg','image/png','image/webp','image/gif',
        'image/heic','image/heif',
        'video/mp4','video/webm','video/quicktime','video/x-m4v'
      )
    )
  )
);

CREATE POLICY "Public buckets safe extension allowlist update"
ON storage.objects
AS RESTRICTIVE
FOR UPDATE
TO public
USING (true)
WITH CHECK (
  bucket_id NOT IN ('media','posts','banners','share-cards','avatars')
  OR (
    lower(storage.extension(name)) IN ('jpg','jpeg','png','webp','gif','heic','heif','mp4','webm','mov','m4v')
    AND (
      metadata IS NULL
      OR metadata->>'mimetype' IS NULL
      OR lower(metadata->>'mimetype') IN (
        'image/jpeg','image/jpg','image/png','image/webp','image/gif',
        'image/heic','image/heif',
        'video/mp4','video/webm','video/quicktime','video/x-m4v'
      )
    )
  )
);