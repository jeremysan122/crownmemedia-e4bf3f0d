
-- Equip / unequip an owned crown
CREATE OR REPLACE FUNCTION public.equip_achievement_crown(_crown_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;
  IF _crown_id IS NULL THEN
    UPDATE public.profiles SET equipped_achievement_crown_id = NULL WHERE id = _uid;
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_achievement_crowns WHERE user_id = _uid AND crown_id = _crown_id) THEN
    RAISE EXCEPTION 'crown not owned' USING ERRCODE = '42501';
  END IF;
  UPDATE public.profiles SET equipped_achievement_crown_id = _crown_id WHERE id = _uid;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.equip_achievement_crown(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.equip_achievement_crown(uuid) TO authenticated;

-- Return the full 100-crown catalog with per-user state
CREATE OR REPLACE FUNCTION public.my_achievement_crowns()
RETURNS TABLE (
  crown_id uuid,
  slug text,
  name text,
  description text,
  lore text,
  unlock_hint text,
  rarity text,
  tier_index integer,
  collection_slug text,
  collection_name text,
  asset_url text,
  requirement_logic jsonb,
  is_secret boolean,
  sort_order integer,
  owned boolean,
  equipped boolean,
  unlocked_at timestamptz,
  progress numeric,
  target numeric,
  completion_percent numeric,
  last_evaluated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id,
    c.slug,
    c.name,
    c.description,
    c.lore,
    c.unlock_hint,
    c.rarity,
    c.tier_index,
    c.collection_slug,
    c.collection_name,
    c.asset_url,
    c.requirement_logic,
    c.is_secret,
    c.sort_order,
    (o.crown_id IS NOT NULL) AS owned,
    (p.equipped_achievement_crown_id = c.id) AS equipped,
    o.unlocked_at,
    COALESCE(pr.progress, 0) AS progress,
    COALESCE(pr.target, 0) AS target,
    COALESCE(pr.completion_percent, 0) AS completion_percent,
    pr.last_evaluated_at
  FROM public.achievement_crowns c
  LEFT JOIN public.user_achievement_crowns o
    ON o.crown_id = c.id AND o.user_id = auth.uid()
  LEFT JOIN public.user_crown_progress pr
    ON pr.crown_id = c.id AND pr.user_id = auth.uid()
  LEFT JOIN public.profiles p
    ON p.id = auth.uid()
  WHERE c.is_active = true
  ORDER BY c.sort_order, c.tier_index;
$$;

REVOKE EXECUTE ON FUNCTION public.my_achievement_crowns() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_achievement_crowns() TO authenticated;

-- Trigger fn: evaluate crowns for a user after wins/follows/posts.
-- Wraps evaluate_user_crowns so trigger failures don't roll back the parent write.
CREATE OR REPLACE FUNCTION public.tg_evaluate_crowns_for_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid;
BEGIN
  _uid := COALESCE(
    (NEW).user_id::uuid,
    NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
  );
  IF _uid IS NULL THEN RETURN NEW; END IF;
  BEGIN
    PERFORM public.evaluate_user_crowns(_uid);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'evaluate_user_crowns failed for %: %', _uid, SQLERRM;
  END;
  RETURN NEW;
END;
$$;

-- Wire triggers only if the target tables/columns exist so this migration is safe.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='posts') THEN
    DROP TRIGGER IF EXISTS trg_crowns_after_post_insert ON public.posts;
    CREATE TRIGGER trg_crowns_after_post_insert
      AFTER INSERT ON public.posts
      FOR EACH ROW EXECUTE FUNCTION public.tg_evaluate_crowns_for_user();
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='follows') THEN
    DROP TRIGGER IF EXISTS trg_crowns_after_follow_insert ON public.follows;
    CREATE TRIGGER trg_crowns_after_follow_insert
      AFTER INSERT ON public.follows
      FOR EACH ROW EXECUTE FUNCTION public.tg_evaluate_crowns_for_user();
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='battles' AND column_name='winner_id') THEN
    DROP TRIGGER IF EXISTS trg_crowns_after_battle_winner ON public.battles;
    CREATE TRIGGER trg_crowns_after_battle_winner
      AFTER UPDATE OF winner_id ON public.battles
      FOR EACH ROW
      WHEN (NEW.winner_id IS NOT NULL AND NEW.winner_id IS DISTINCT FROM OLD.winner_id)
      EXECUTE FUNCTION public.tg_evaluate_crowns_for_user();
  END IF;
END $$;
