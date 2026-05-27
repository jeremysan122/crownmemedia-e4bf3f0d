DROP POLICY IF EXISTS "Owner update share-cards" ON storage.objects;
CREATE POLICY "Owner update share-cards" ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'share-cards' AND (storage.foldername(name))[1] = auth.uid()::text)
WITH CHECK (bucket_id = 'share-cards' AND (storage.foldername(name))[1] = auth.uid()::text);