CREATE POLICY "Crown assets are publicly readable"
ON storage.objects FOR SELECT
USING (bucket_id = 'achievement-crowns');

CREATE POLICY "Admins upload crown assets"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'achievement-crowns'
  AND public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Admins update crown assets"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'achievement-crowns'
  AND public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Admins delete crown assets"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'achievement-crowns'
  AND public.has_role(auth.uid(), 'admin')
);