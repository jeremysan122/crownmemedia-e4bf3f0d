
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Admins can read crown masters'
  ) THEN
    CREATE POLICY "Admins can read crown masters"
    ON storage.objects
    FOR SELECT
    TO authenticated
    USING (
      bucket_id = 'achievement-crowns-v2-masters'
      AND public.has_role(auth.uid(), 'admin')
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Admins can manage crown masters'
  ) THEN
    CREATE POLICY "Admins can manage crown masters"
    ON storage.objects
    FOR ALL
    TO authenticated
    USING (
      bucket_id = 'achievement-crowns-v2-masters'
      AND public.has_role(auth.uid(), 'admin')
    )
    WITH CHECK (
      bucket_id = 'achievement-crowns-v2-masters'
      AND public.has_role(auth.uid(), 'admin')
    );
  END IF;
END $$;
