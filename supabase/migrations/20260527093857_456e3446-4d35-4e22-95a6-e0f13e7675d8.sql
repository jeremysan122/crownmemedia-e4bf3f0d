
-- 1. profiles.gender: restrict from anon/authenticated (only owner via get_my_profile)
REVOKE SELECT (gender) ON public.profiles FROM anon, authenticated;

-- 2. verification_requests: hide internal admin fields from owner SELECT
REVOKE SELECT (review_notes, reviewer_id) ON public.verification_requests FROM anon, authenticated;
GRANT SELECT (review_notes, reviewer_id) ON public.verification_requests TO service_role;

-- 3. banners bucket: public read (bucket is public)
DROP POLICY IF EXISTS "Banners public read" ON storage.objects;
CREATE POLICY "Banners public read"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'banners');

-- 4. media bucket: public read (bucket is public)
DROP POLICY IF EXISTS "Media public read" ON storage.objects;
CREATE POLICY "Media public read"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'media');
