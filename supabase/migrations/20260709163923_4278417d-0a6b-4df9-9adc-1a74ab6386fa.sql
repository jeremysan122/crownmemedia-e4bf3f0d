
CREATE INDEX IF NOT EXISTS idx_reports_status_created ON public.reports (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crowns_category_active_score ON public.crowns (category, active, crown_score DESC);
CREATE INDEX IF NOT EXISTS idx_crowns_active_score ON public.crowns (crown_score DESC) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_battle_votes_battle_created ON public.battle_votes (battle_id, created_at DESC);
