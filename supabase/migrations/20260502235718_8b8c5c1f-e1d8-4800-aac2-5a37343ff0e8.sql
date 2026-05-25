-- Defense-in-depth: explicitly deny UPDATE on evidence storage objects.
-- (No UPDATE policy currently exists, but an explicit restrictive policy
--  prevents future regressions where an overly broad ALL policy gets added.)
DROP POLICY IF EXISTS "Evidence no update" ON storage.objects;
CREATE POLICY "Evidence no update"
  ON storage.objects
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated, anon
  USING (bucket_id <> 'evidence')
  WITH CHECK (bucket_id <> 'evidence');