-- Royal Filter System: extend posts table with separate photo/video filter slots,
-- backfill from the legacy `filter` column, and update the validation trigger to
-- accept the 20 photo + 10 video filter ids.

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS photo_filter text,
  ADD COLUMN IF NOT EXISTS video_filter text,
  ADD COLUMN IF NOT EXISTS filter_type  text;

-- Backfill from legacy `filter` column. Old ids that don't map to a new royal
-- filter become NULL (original media).
DO $$
BEGIN
  -- Photo posts (media_type = 'image' or null)
  UPDATE public.posts
     SET photo_filter = filter,
         filter_type  = 'photo'
   WHERE filter IS NOT NULL
     AND coalesce(media_type, 'image') = 'image'
     AND photo_filter IS NULL;

  -- Video posts
  UPDATE public.posts
     SET video_filter = filter,
         filter_type  = 'video'
   WHERE filter IS NOT NULL
     AND media_type = 'video'
     AND video_filter IS NULL;
END $$;

-- Replace media validator to allow the new royal filter ids.
CREATE OR REPLACE FUNCTION public.posts_validate_media()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_photo_ok boolean;
  v_video_ok boolean;
BEGIN
  IF NEW.media_type NOT IN ('image','video') THEN
    RAISE EXCEPTION 'Invalid media_type: %', NEW.media_type;
  END IF;

  -- Allow legacy ids (back-compat) + new royal photo filters.
  v_photo_ok := NEW.photo_filter IS NULL OR NEW.photo_filter IN (
    'none',
    -- legacy
    'sepia','noir','vivid','fade','chrome',
    -- royal photo filters (20)
    'royal_gold_glow','imperial_purple','crown_shine','velvet_night','regal_matte',
    'diamond_luxe','golden_hour_king','platinum_ice','royal_noir','throne_contrast',
    'noble_fade','crown_aura','sapphire_rich','kings_skin','royal_editorial',
    'golden_edge','dynasty_glow','elite_clarity','dark_crown','emperor_tone'
  );
  v_video_ok := NEW.video_filter IS NULL OR NEW.video_filter IN (
    'none',
    -- legacy animated
    'shimmer','glitch','pulse-glow','scanlines','gold-sparkle',
    -- royal video filters (10)
    'gold_shimmer','crown_sparkle','pulse_glow','royal_glitch','golden_dust',
    'throne_light_rays','crown_energy','scanline_prestige','diamond_flicker','god_emperor_glow'
  );

  IF NOT v_photo_ok THEN
    RAISE EXCEPTION 'Invalid photo_filter: %', NEW.photo_filter;
  END IF;
  IF NOT v_video_ok THEN
    RAISE EXCEPTION 'Invalid video_filter: %', NEW.video_filter;
  END IF;

  -- Keep legacy `filter` column accepting the union too, so older clients
  -- can still post during rollout.
  IF NEW.filter IS NOT NULL AND NEW.filter NOT IN (
    'none',
    'sepia','noir','vivid','fade','chrome',
    'shimmer','glitch','pulse-glow','scanlines','gold-sparkle',
    'royal_gold_glow','imperial_purple','crown_shine','velvet_night','regal_matte',
    'diamond_luxe','golden_hour_king','platinum_ice','royal_noir','throne_contrast',
    'noble_fade','crown_aura','sapphire_rich','kings_skin','royal_editorial',
    'golden_edge','dynasty_glow','elite_clarity','dark_crown','emperor_tone',
    'gold_shimmer','crown_sparkle','pulse_glow','royal_glitch','golden_dust',
    'throne_light_rays','crown_energy','scanline_prestige','diamond_flicker','god_emperor_glow'
  ) THEN
    RAISE EXCEPTION 'Invalid filter: %', NEW.filter;
  END IF;

  IF NEW.filter_type IS NOT NULL AND NEW.filter_type NOT IN ('photo','video') THEN
    RAISE EXCEPTION 'Invalid filter_type: %', NEW.filter_type;
  END IF;

  IF NEW.media_type = 'video' THEN
    IF NEW.video_url IS NULL OR length(NEW.video_url) = 0 THEN
      RAISE EXCEPTION 'Video posts must have a video_url';
    END IF;
    IF NEW.duration_ms IS NOT NULL AND NEW.duration_ms > 30000 THEN
      RAISE EXCEPTION 'Videos cannot exceed 30 seconds';
    END IF;
  END IF;

  IF NEW.alt_texts IS NULL THEN NEW.alt_texts := '{}'; END IF;
  RETURN NEW;
END;
$function$;