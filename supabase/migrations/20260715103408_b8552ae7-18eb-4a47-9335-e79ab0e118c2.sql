
-- 1) crown_number
ALTER TABLE public.achievement_crowns ADD COLUMN IF NOT EXISTS crown_number integer;
UPDATE public.achievement_crowns SET crown_number = sort_order WHERE crown_number IS NULL AND is_active = true;

DO $$
DECLARE t integer; mn integer; mx integer; d integer;
BEGIN
  SELECT COUNT(*), MIN(crown_number), MAX(crown_number), COUNT(DISTINCT crown_number)
    INTO t, mn, mx, d FROM public.achievement_crowns WHERE is_active = true;
  IF t <> 100 OR mn <> 1 OR mx <> 100 OR d <> 100 THEN
    RAISE EXCEPTION 'crown_number invariant failed: t=%, mn=%, mx=%, d=%', t, mn, mx, d;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS achievement_crowns_crown_number_unique
  ON public.achievement_crowns(crown_number) WHERE is_active = true;

-- 2) Rollback snapshot
CREATE TABLE IF NOT EXISTS public.achievement_crown_url_snapshots (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  snapshot_label text NOT NULL,
  crown_id uuid NOT NULL,
  slug text NOT NULL,
  crown_number integer,
  asset_url text,
  gallery_asset_url text,
  wearable_asset_url text,
  thumbnail_url text,
  master_asset_url text,
  legacy_asset_url text,
  asset_version integer,
  image_quality_verified boolean,
  captured_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.achievement_crown_url_snapshots TO authenticated;
GRANT ALL ON public.achievement_crown_url_snapshots TO service_role;
ALTER TABLE public.achievement_crown_url_snapshots ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='achievement_crown_url_snapshots' AND policyname='Admins read snapshots') THEN
    CREATE POLICY "Admins read snapshots" ON public.achievement_crown_url_snapshots
      FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='achievement_crown_url_snapshots' AND policyname='Service role manages snapshots') THEN
    CREATE POLICY "Service role manages snapshots" ON public.achievement_crown_url_snapshots
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

INSERT INTO public.achievement_crown_url_snapshots
  (snapshot_label, crown_id, slug, crown_number, asset_url, gallery_asset_url,
   wearable_asset_url, thumbnail_url, master_asset_url, legacy_asset_url,
   asset_version, image_quality_verified)
SELECT
  'pre-final-remediation-2026-07-15', id, slug, crown_number, asset_url, gallery_asset_url,
  wearable_asset_url, thumbnail_url, master_asset_url, legacy_asset_url,
  asset_version, image_quality_verified
FROM public.achievement_crowns WHERE is_active = true;

-- 3) Feature flag (audience must be one of: all, admins, royal_pass)
INSERT INTO public.feature_flags (key, enabled, rollout_percent, audience, description)
VALUES ('achievement_crowns_enabled', false, 0, 'admins',
        'Gates the 100-crown achievement system. Rollout: disabled -> admins -> royal_pass -> all.')
ON CONFLICT (key) DO NOTHING;

-- 4) Fix crowns 041-050 to use approved WebP derivatives already in storage
UPDATE public.achievement_crowns
SET
  gallery_asset_url  = 'https://bailrqskqpmzvsgivhvm.supabase.co/storage/v1/object/public/achievement-crowns-v2/gallery/crown-'  || lpad(crown_number::text, 3, '0') || '-gallery.webp',
  wearable_asset_url = 'https://bailrqskqpmzvsgivhvm.supabase.co/storage/v1/object/public/achievement-crowns-v2/wearable/crown-' || lpad(crown_number::text, 3, '0') || '-wearable.webp',
  updated_at = now()
WHERE crown_number BETWEEN 41 AND 50 AND is_active = true;
