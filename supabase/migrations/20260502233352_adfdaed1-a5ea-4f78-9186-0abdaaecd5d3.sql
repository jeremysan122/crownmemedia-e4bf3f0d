-- =============== Evidence columns ===============
ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS evidence_paths text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.report_appeals
  ADD COLUMN IF NOT EXISTS evidence_paths text[] NOT NULL DEFAULT '{}';

-- =============== Tighten RLS: reports ===============
-- Drop existing select/update policies and recreate stricter
DROP POLICY IF EXISTS "Reporter sees own reports" ON public.reports;
DROP POLICY IF EXISTS "Mods update reports" ON public.reports;

CREATE POLICY "Reports: reporter or mods read own"
  ON public.reports
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = reporter_id
    OR public.has_role(auth.uid(), 'moderator'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

-- Only mods/admins can update reports (status, mod_notes, resolved_at)
CREATE POLICY "Reports: mods update only"
  ON public.reports
  FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'moderator'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'moderator'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

-- Restrictive deny for anon
CREATE POLICY "Reports: deny anon"
  ON public.reports
  AS RESTRICTIVE
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);

-- =============== Tighten RLS: report_appeals ===============
DROP POLICY IF EXISTS "Users view own appeals" ON public.report_appeals;
DROP POLICY IF EXISTS "Users create own appeals" ON public.report_appeals;
DROP POLICY IF EXISTS "Mods update appeals" ON public.report_appeals;

CREATE POLICY "Appeals: author or mods read"
  ON public.report_appeals
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    OR public.has_role(auth.uid(), 'moderator'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "Appeals: author submits own appeal"
  ON public.report_appeals
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND length(body) BETWEEN 20 AND 2000
    AND EXISTS (
      SELECT 1 FROM public.reports r
      WHERE r.id = report_appeals.report_id
        AND r.reporter_id = auth.uid()
    )
  );

CREATE POLICY "Appeals: mods update only"
  ON public.report_appeals
  FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'moderator'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'moderator'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "Appeals: deny anon"
  ON public.report_appeals
  AS RESTRICTIVE
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);

-- =============== Evidence storage bucket (PRIVATE) ===============
INSERT INTO storage.buckets (id, name, public)
VALUES ('evidence', 'evidence', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- Owner uploads into their own /<uid>/... folder
DROP POLICY IF EXISTS "Evidence owner upload" ON storage.objects;
CREATE POLICY "Evidence owner upload"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'evidence'
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );

-- Owner reads their own evidence; mods/admins read any
DROP POLICY IF EXISTS "Evidence owner or mod read" ON storage.objects;
CREATE POLICY "Evidence owner or mod read"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'evidence'
    AND (
      (storage.foldername(name))[1] = (auth.uid())::text
      OR public.has_role(auth.uid(), 'moderator'::app_role)
      OR public.has_role(auth.uid(), 'admin'::app_role)
    )
  );

-- Owner can delete their own evidence (mods/admins too)
DROP POLICY IF EXISTS "Evidence owner or mod delete" ON storage.objects;
CREATE POLICY "Evidence owner or mod delete"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'evidence'
    AND (
      (storage.foldername(name))[1] = (auth.uid())::text
      OR public.has_role(auth.uid(), 'moderator'::app_role)
      OR public.has_role(auth.uid(), 'admin'::app_role)
    )
  );

-- =============== Lock down internal SECURITY DEFINER helpers ===============
-- These are only meant to be used inside RLS policies / other functions, not via PostgREST RPC.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.is_thread_muted(uuid, uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.notif_pref(uuid, text) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.get_my_profile_sensitive() FROM anon, authenticated, public;

-- =============== Tighten public bucket SELECT policies (lint 0025) ===============
-- Public CDN URLs (object download endpoint) bypass RLS and continue to work.
-- These policies only affect what authenticated/anon users can LIST via the API.
DROP POLICY IF EXISTS "Authenticated read avatars" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated read banners" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated read posts" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated read share-cards" ON storage.objects;
DROP POLICY IF EXISTS "Media public read" ON storage.objects;

-- Owner-scoped LIST/SELECT replacements — public viewing happens via getPublicUrl, not list
CREATE POLICY "Avatars owner list"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = (auth.uid())::text);

CREATE POLICY "Banners owner list"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'banners' AND (storage.foldername(name))[1] = (auth.uid())::text);

CREATE POLICY "Posts owner list"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'posts' AND (storage.foldername(name))[1] = (auth.uid())::text);

CREATE POLICY "Share-cards owner list"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'share-cards' AND (storage.foldername(name))[1] = (auth.uid())::text);

CREATE POLICY "Media owner list"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'media' AND (storage.foldername(name))[1] = (auth.uid())::text);
