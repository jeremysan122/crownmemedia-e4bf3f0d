
-- ============================================================
-- 1. Rarity stats: how many players own each crown
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_crown_rarity_stats(_crown_ids uuid[])
RETURNS TABLE(crown_id uuid, owners_count int, total_players int, ownership_pct numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH totals AS (
    SELECT GREATEST(COUNT(*)::int, 1) AS n FROM public.profiles
  ),
  owners AS (
    SELECT uac.crown_id, COUNT(DISTINCT uac.user_id)::int AS c
      FROM public.user_achievement_crowns uac
     WHERE uac.crown_id = ANY(_crown_ids)
     GROUP BY uac.crown_id
  )
  SELECT
    c.id AS crown_id,
    COALESCE(o.c, 0) AS owners_count,
    t.n AS total_players,
    ROUND((COALESCE(o.c, 0)::numeric / t.n::numeric) * 100, 2) AS ownership_pct
  FROM public.achievement_crowns c
  CROSS JOIN totals t
  LEFT JOIN owners o ON o.crown_id = c.id
  WHERE c.id = ANY(_crown_ids);
$$;

GRANT EXECUTE ON FUNCTION public.get_crown_rarity_stats(uuid[]) TO anon, authenticated;

-- ============================================================
-- 2. Public crown share lookup (no auth required)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_public_crown_by_slug(_slug text)
RETURNS TABLE(
  id uuid, slug text, name text, description text, lore text,
  rarity text, tier_index int, crown_number int,
  collection_slug text, collection_name text,
  gallery_asset_url text, thumbnail_url text, asset_version text,
  owners_count int, total_players int, ownership_pct numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH totals AS (
    SELECT GREATEST(COUNT(*)::int, 1) AS n FROM public.profiles
  ),
  crown AS (
    SELECT * FROM public.achievement_crowns
     WHERE slug = _slug AND is_active = true
     LIMIT 1
  ),
  owners AS (
    SELECT COUNT(DISTINCT uac.user_id)::int AS c
      FROM public.user_achievement_crowns uac
      JOIN crown ON crown.id = uac.crown_id
  )
  SELECT
    c.id, c.slug, c.name, c.description, c.lore,
    c.rarity, c.tier_index, c.crown_number,
    c.collection_slug, c.collection_name,
    c.gallery_asset_url, c.thumbnail_url, c.asset_version,
    o.c AS owners_count, t.n AS total_players,
    ROUND((o.c::numeric / t.n::numeric) * 100, 2) AS ownership_pct
  FROM crown c CROSS JOIN totals t CROSS JOIN owners o;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_crown_by_slug(text) TO anon, authenticated;

-- ============================================================
-- 3. Collection completion titles — seed 10 titles (idempotent)
-- ============================================================
INSERT INTO public.titles(slug, text, description, rarity) VALUES
  ('battle-sovereign',    'Battle Sovereign',    'Owns all 10 Battle Champion crowns.',   'legendary'),
  ('content-sovereign',   'Content Sovereign',   'Owns all 10 Content Crown crowns.',     'legendary'),
  ('crown-sovereign',     'Crown Sovereign',     'Owns all 10 Crown Hoarder crowns.',     'legendary'),
  ('gilded-sovereign',    'Gilded Sovereign',    'Owns all 10 Gilded Patron crowns.',     'legendary'),
  ('legend-sovereign',    'Legend Sovereign',    'Owns all 10 Legendary crowns.',         'mythic'),
  ('origin-sovereign',    'Origin Sovereign',    'Owns all 10 Origin crowns.',            'legendary'),
  ('social-sovereign-title','Social Sovereign',  'Owns all 10 Social Sovereign crowns.',  'legendary'),
  ('arena-sage-sovereign','Arena Sage Sovereign','Owns all 10 Arena Sage crowns.',        'legendary'),
  ('streak-sovereign-title','Streak Sovereign',  'Owns all 10 Streak Sovereign crowns.',  'legendary'),
  ('tournament-sovereign','Tournament Sovereign','Owns all 10 Tournament Titan crowns.',  'legendary')
ON CONFLICT (slug) DO NOTHING;

-- ============================================================
-- 4. Collection progress helper (per-user)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_collection_progress(_user_id uuid)
RETURNS TABLE(collection_slug text, collection_name text, owned int, total int, complete boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    ac.collection_slug,
    MAX(ac.collection_name) AS collection_name,
    COUNT(uac.crown_id)::int AS owned,
    COUNT(*)::int AS total,
    COUNT(uac.crown_id) = COUNT(*) AS complete
  FROM public.achievement_crowns ac
  LEFT JOIN public.user_achievement_crowns uac
    ON uac.crown_id = ac.id AND uac.user_id = _user_id
  WHERE ac.is_active = true
  GROUP BY ac.collection_slug
  ORDER BY ac.collection_slug;
$$;

GRANT EXECUTE ON FUNCTION public.get_collection_progress(uuid) TO authenticated;

-- ============================================================
-- 5. Map collection slug -> title slug (used by the evaluator)
-- ============================================================
CREATE OR REPLACE FUNCTION public.collection_completion_title_slug(_collection_slug text)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE _collection_slug
    WHEN 'battler'       THEN 'battle-sovereign'
    WHEN 'creator'       THEN 'content-sovereign'
    WHEN 'crown_hoarder' THEN 'crown-sovereign'
    WHEN 'gifter'        THEN 'gilded-sovereign'
    WHEN 'legend'        THEN 'legend-sovereign'
    WHEN 'origin'        THEN 'origin-sovereign'
    WHEN 'social'        THEN 'social-sovereign-title'
    WHEN 'spectator'     THEN 'arena-sage-sovereign'
    WHEN 'streak'        THEN 'streak-sovereign-title'
    WHEN 'tournament'    THEN 'tournament-sovereign'
    ELSE NULL END;
$$;

-- ============================================================
-- 6. Extend evaluator to grant collection titles
-- ============================================================
CREATE OR REPLACE FUNCTION public.evaluate_user_crowns(_user_id uuid)
RETURNS TABLE(newly_unlocked_crown_ids uuid[])
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  metrics JSONB;
  crown RECORD;
  progress_val NUMERIC;
  target_val NUMERIC;
  is_met BOOLEAN;
  unlocked UUID[] := ARRAY[]::UUID[];
  owned_count NUMERIC;
  did_insert BOOLEAN;
  coll RECORD;
  title_slug TEXT;
  title_row RECORD;
  title_inserted BOOLEAN;
BEGIN
  IF _user_id IS NULL THEN RAISE EXCEPTION 'user_id required'; END IF;
  metrics := public.get_user_crown_metrics(_user_id);

  FOR crown IN
    SELECT ac.id, ac.slug, ac.name, ac.rarity, ac.gallery_asset_url, ac.thumbnail_url, ac.collection_name, ac.requirement_logic
    FROM public.achievement_crowns ac
    WHERE ac.is_active = true
  LOOP
    progress_val := 0; target_val := 1; is_met := false;

    IF (crown.requirement_logic->>'type') = 'metric' THEN
      target_val := COALESCE((crown.requirement_logic->>'threshold')::numeric, 1);
      progress_val := COALESCE((metrics->>(crown.requirement_logic->>'metric'))::numeric, 0);
      is_met := progress_val >= target_val;
    ELSIF (crown.requirement_logic->>'type') = 'composite_all_crowns' THEN
      target_val := COALESCE((crown.requirement_logic->>'required_count')::numeric, 99);
      SELECT COUNT(*)::numeric INTO owned_count
        FROM public.user_achievement_crowns uac
        JOIN public.achievement_crowns ac2 ON ac2.id = uac.crown_id
       WHERE uac.user_id = _user_id AND ac2.slug <> crown.slug;
      progress_val := owned_count;
      is_met := progress_val >= target_val;
    END IF;

    INSERT INTO public.user_crown_progress(user_id, crown_id, progress, target, completion_percent, last_evaluated_at)
    VALUES (_user_id, crown.id, progress_val, target_val,
            LEAST(100, ROUND((progress_val / NULLIF(target_val,0)) * 100, 2)), now())
    ON CONFLICT (user_id, crown_id) DO UPDATE
      SET progress = EXCLUDED.progress, target = EXCLUDED.target,
          completion_percent = EXCLUDED.completion_percent,
          last_evaluated_at = now(), updated_at = now();

    IF is_met THEN
      did_insert := false;
      WITH ins AS (
        INSERT INTO public.user_achievement_crowns(user_id, crown_id, unlocked_at, source)
        VALUES (_user_id, crown.id, now(), 'evaluator')
        ON CONFLICT (user_id, crown_id) DO NOTHING
        RETURNING crown_id
      )
      SELECT true INTO did_insert FROM ins;

      IF did_insert THEN
        unlocked := array_append(unlocked, crown.id);
        INSERT INTO public.notifications(user_id, type, title, body, payload, read)
        VALUES (
          _user_id, 'crown_unlocked',
          'New Achievement Crown unlocked',
          crown.name || ' · ' || crown.collection_name,
          jsonb_build_object(
            'kind', 'crown_unlocked',
            'crown_id', crown.id, 'slug', crown.slug,
            'name', crown.name, 'rarity', crown.rarity,
            'collection_name', crown.collection_name,
            'gallery_asset_url', crown.gallery_asset_url,
            'thumbnail_url', crown.thumbnail_url
          ), false
        );
      END IF;
    END IF;
  END LOOP;

  -- Collection completion pass: grant collection titles for any complete set
  FOR coll IN
    SELECT collection_slug, collection_name, owned, total, complete
      FROM public.get_collection_progress(_user_id)
     WHERE complete = true
  LOOP
    title_slug := public.collection_completion_title_slug(coll.collection_slug);
    IF title_slug IS NULL THEN CONTINUE; END IF;

    SELECT * INTO title_row FROM public.titles WHERE slug = title_slug;
    IF title_row IS NULL THEN CONTINUE; END IF;

    title_inserted := false;
    WITH ins AS (
      INSERT INTO public.user_titles(user_id, title_slug, equipped, unlocked_at)
      VALUES (_user_id, title_slug, false, now())
      ON CONFLICT (user_id, title_slug) DO NOTHING
      RETURNING title_slug
    )
    SELECT true INTO title_inserted FROM ins;

    IF title_inserted THEN
      INSERT INTO public.notifications(user_id, type, title, body, payload, read)
      VALUES (
        _user_id, 'collection_completed',
        'Collection complete!',
        coll.collection_name || ' · Title unlocked: ' || title_row.text,
        jsonb_build_object(
          'kind', 'collection_completed',
          'collection_slug', coll.collection_slug,
          'collection_name', coll.collection_name,
          'title_slug', title_slug,
          'title_text', title_row.text,
          'rarity', title_row.rarity
        ), false
      );
    END IF;
  END LOOP;

  newly_unlocked_crown_ids := unlocked;
  RETURN NEXT;
END;
$$;
