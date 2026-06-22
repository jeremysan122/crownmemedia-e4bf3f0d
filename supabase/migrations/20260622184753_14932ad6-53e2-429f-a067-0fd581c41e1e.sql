-- share_cards
CREATE TABLE IF NOT EXISTS public.share_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type text NOT NULL CHECK (target_type IN ('post','profile','scroll','battle','crown')),
  target_id uuid NOT NULL,
  image_path text NOT NULL,
  is_sensitive_safe boolean NOT NULL DEFAULT true,
  generated_at timestamptz NOT NULL DEFAULT now(),
  invalidated_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT share_cards_unique UNIQUE (target_type, target_id)
);
GRANT SELECT ON public.share_cards TO authenticated;
GRANT ALL ON public.share_cards TO service_role;
ALTER TABLE public.share_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "share_cards readable when not invalidated" ON public.share_cards
  FOR SELECT TO authenticated USING (invalidated_at IS NULL);
CREATE INDEX idx_share_cards_target ON public.share_cards(target_type, target_id);
CREATE TRIGGER trg_share_cards_updated_at BEFORE UPDATE ON public.share_cards FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- share_events
CREATE TABLE IF NOT EXISTS public.share_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sharer_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  target_type text NOT NULL CHECK (target_type IN ('post','profile','scroll','battle','crown')),
  target_id uuid NOT NULL,
  channel text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.share_events TO authenticated;
GRANT ALL ON public.share_events TO service_role;
ALTER TABLE public.share_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sharer can insert own share_events" ON public.share_events
  FOR INSERT TO authenticated WITH CHECK (sharer_user_id = auth.uid());
CREATE POLICY "sharer reads own share_events" ON public.share_events
  FOR SELECT TO authenticated USING (sharer_user_id = auth.uid());
CREATE POLICY "admins read all share_events" ON public.share_events
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE INDEX idx_share_events_target ON public.share_events(target_type, target_id, created_at DESC);
CREATE INDEX idx_share_events_sharer ON public.share_events(sharer_user_id, created_at DESC);

-- crown_map_points
CREATE TABLE IF NOT EXISTS public.crown_map_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  category text,
  region_type text NOT NULL CHECK (region_type IN ('city','state','country','global')),
  region_name text,
  lat double precision,
  lng double precision,
  score numeric NOT NULL DEFAULT 0,
  rank integer,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  refreshed_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.crown_map_points TO authenticated;
GRANT ALL ON public.crown_map_points TO service_role;
ALTER TABLE public.crown_map_points ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crown_map_points readable to signed-in users" ON public.crown_map_points
  FOR SELECT TO authenticated USING (true);
CREATE UNIQUE INDEX crown_map_points_unique ON public.crown_map_points(user_id, COALESCE(category,''), region_type, COALESCE(region_name,''));
CREATE INDEX idx_crown_map_lookup ON public.crown_map_points(region_type, category, score DESC);
CREATE INDEX idx_crown_map_geo ON public.crown_map_points(lat, lng) WHERE lat IS NOT NULL AND lng IS NOT NULL;