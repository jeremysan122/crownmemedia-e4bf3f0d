CREATE TABLE IF NOT EXISTS public.post_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('image','video','thumbnail','blurred_safe')),
  position smallint NOT NULL DEFAULT 0,
  storage_bucket text NOT NULL DEFAULT 'media',
  storage_path text NOT NULL,
  public_url text,
  mime_type text,
  bytes bigint,
  width integer,
  height integer,
  duration_ms integer,
  blurhash text,
  safe_variant_path text,
  moderation_status text NOT NULL DEFAULT 'pending'
    CHECK (moderation_status IN ('pending','approved','blocked','needs_review')),
  is_sensitive boolean NOT NULL DEFAULT false,
  alt_text text,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.post_media TO authenticated;
GRANT ALL ON public.post_media TO service_role;

ALTER TABLE public.post_media ENABLE ROW LEVEL SECURITY;

CREATE POLICY "post_media viewable when post is viewable"
  ON public.post_media FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL AND EXISTS (
      SELECT 1 FROM public.posts p
      WHERE p.id = post_media.post_id AND p.is_removed = false
    )
  );

CREATE POLICY "owner manages own post_media"
  ON public.post_media FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.posts p WHERE p.id = post_media.post_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.posts p WHERE p.id = post_media.post_id AND p.user_id = auth.uid()));

CREATE POLICY "admins and moderators manage post_media"
  ON public.post_media FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'moderator'));

CREATE INDEX idx_post_media_post ON public.post_media(post_id, position) WHERE deleted_at IS NULL;
CREATE INDEX idx_post_media_mod_status ON public.post_media(moderation_status) WHERE moderation_status IN ('pending','needs_review');
CREATE INDEX idx_post_media_deleted ON public.post_media(deleted_at) WHERE deleted_at IS NOT NULL;

CREATE TRIGGER trg_post_media_updated_at
  BEFORE UPDATE ON public.post_media
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();