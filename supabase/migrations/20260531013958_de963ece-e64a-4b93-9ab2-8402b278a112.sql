-- ============================================================
-- Part 2: Royal Pass — wire perks to actual effects
-- ============================================================

-- 1) Track origin of a boost row so we can rate-limit daily pass claims
ALTER TABLE public.boosts
  ADD COLUMN IF NOT EXISTS source text;

CREATE INDEX IF NOT EXISTS idx_boosts_user_source_started
  ON public.boosts (user_id, source, started_at DESC)
  WHERE source IS NOT NULL;

-- 2) Permanent Crown Shield for Royal Pass holders.
--    Treat the current crown holder as shielded if they have an active pass,
--    in addition to the existing crown_shield_until check.
CREATE OR REPLACE FUNCTION public.refresh_crowns_for_post(_post_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  p record;
  s text;
  region_val text;
  top_post record;
  cat public.crown_category;
  cats public.crown_category[] := array['overall','best_style','most_creative','most_popular','best_look','best_outfit'];
  current_crown record;
  shield_active boolean;
  pass_active boolean;
begin
  select * into p from public.posts where id = _post_id;
  if not found then return; end if;

  foreach s in array array['city','state','country','global'] loop
    if s = 'city' then region_val := p.city;
    elsif s = 'state' then region_val := p.state;
    elsif s = 'country' then region_val := p.country;
    else region_val := 'Global';
    end if;
    if region_val is null or region_val = '' then continue; end if;

    foreach cat in array cats loop
      select po.id, po.user_id, po.crown_score into top_post
      from public.posts po
      where po.is_removed = false
        and po.category = cat
        and ( (s='city' and po.city = region_val)
           or (s='state' and po.state = region_val)
           or (s='country' and po.country = region_val)
           or (s='global'))
      order by po.crown_score desc, po.created_at asc
      limit 1;

      if top_post.id is null then continue; end if;

      select c.user_id, c.post_id into current_crown
      from public.crowns c
      where c.region_type = s::public.region_type
        and c.region_name = region_val
        and c.category = cat
        and c.active = true
      limit 1;

      if current_crown.user_id is not null
         and current_crown.user_id <> top_post.user_id then
        select coalesce(crown_shield_until > now(), false) into shield_active
        from public.posts where id = current_crown.post_id;
        select public.is_royal_pass_active(current_crown.user_id) into pass_active;
        if shield_active or pass_active then
          update public.crowns set crown_score = (select crown_score from public.posts where id = current_crown.post_id)
            where region_type = s::public.region_type and region_name = region_val and category = cat and active = true;
          continue;
        end if;
      end if;

      update public.crowns set active = false, ended_at = now()
      where region_type = s::public.region_type and region_name = region_val and category = cat
        and active = true and user_id <> top_post.user_id;

      if not exists (select 1 from public.crowns where region_type = s::public.region_type and region_name = region_val and category = cat and active = true and user_id = top_post.user_id) then
        insert into public.crowns (user_id, post_id, region_type, region_name, category, title, crown_score)
        values (top_post.user_id, top_post.id, s::public.region_type, region_val, cat,
                'Holder of ' || region_val || ' (' || cat::text || ')', top_post.crown_score);
      else
        update public.crowns set crown_score = top_post.crown_score, post_id = top_post.id
        where region_type = s::public.region_type and region_name = region_val and category = cat and active = true and user_id = top_post.user_id;
      end if;
    end loop;
  end loop;

  update public.profiles p2 set
    crowns_held = (select count(*) from public.crowns where user_id = p2.id and active),
    crowns_total = (select count(*) from public.crowns where user_id = p2.id);
end $$;

-- 3) Priority placement: add a 1.1x multiplier to score when the post owner
--    has an active Royal Pass. Stacks with royal_boost (1.5x).
CREATE OR REPLACE FUNCTION public.recalc_post_score(_post_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  v_crown int; v_fire int; v_diamond int;
  v_comments int; v_shares int; v_battle int;
  v_base numeric; v_score numeric;
  v_boost numeric := 1.0;
  v_boost_until timestamptz;
  v_owner uuid;
  v_pass_boost numeric := 1.0;
begin
  select count(*) filter (where vote_type='crown'),
         count(*) filter (where vote_type='fire'),
         count(*) filter (where vote_type='diamond')
    into v_crown, v_fire, v_diamond
  from public.votes where post_id = _post_id;

  select count(*) into v_comments from public.comments where post_id = _post_id and is_removed = false;
  select coalesce(share_count,0), coalesce(battle_wins,0), royal_boost_until, user_id
    into v_shares, v_battle, v_boost_until, v_owner
  from public.posts where id = _post_id;

  if v_boost_until is not null and v_boost_until > now() then
    v_boost := 1.5;
  end if;

  if v_owner is not null and public.is_royal_pass_active(v_owner) then
    v_pass_boost := 1.1;
  end if;

  v_base := v_crown + (v_fire * 0.5) + (v_diamond * 1.5);
  v_score := (v_base + (v_base * (v_comments * 0.01)) + (v_shares * 0.25) + (v_battle * 5)) * v_boost * v_pass_boost;

  update public.posts
    set crown_score = v_score,
        vote_count = v_crown + v_fire + v_diamond,
        comment_count = v_comments
  where id = _post_id;
end $$;

-- 4) Daily Royal Boost claim for pass holders
CREATE OR REPLACE FUNCTION public.claim_daily_royal_boost(p_post_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_today_claim_count int;
  v_id uuid;
  v_expires timestamptz;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_royal_pass_active(v_uid) THEN
    RAISE EXCEPTION 'Royal Pass required';
  END IF;
  IF p_post_id IS NULL THEN RAISE EXCEPTION 'post_id required'; END IF;

  SELECT user_id INTO v_owner FROM public.posts WHERE id = p_post_id AND is_removed = false;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'Post not found'; END IF;
  IF v_owner <> v_uid THEN RAISE EXCEPTION 'You can only boost your own posts'; END IF;

  SELECT count(*) INTO v_today_claim_count
  FROM public.boosts
  WHERE user_id = v_uid
    AND source = 'royal_pass_daily'
    AND started_at >= (date_trunc('day', now() at time zone 'utc') at time zone 'utc');

  IF v_today_claim_count > 0 THEN
    RAISE EXCEPTION 'Daily Royal Boost already claimed today';
  END IF;

  v_expires := now() + interval '24 hours';

  INSERT INTO public.boosts (user_id, post_id, boost_type, active, expires_at, source)
  VALUES (v_uid, p_post_id, 'royal_boost'::public.boost_type, true, v_expires, 'royal_pass_daily')
  RETURNING id INTO v_id;

  -- trg_sync_boost_to_post will update posts.royal_boost_until and recalc score
  RETURN jsonb_build_object('success', true, 'boost_id', v_id, 'expires_at', v_expires);
END $$;

REVOKE ALL ON FUNCTION public.claim_daily_royal_boost(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_daily_royal_boost(uuid) TO authenticated;

-- Helper: tell client whether today's claim is still available
CREATE OR REPLACE FUNCTION public.royal_pass_daily_boost_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_last timestamptz;
  v_post uuid;
  v_expires timestamptz;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('eligible', false); END IF;
  IF NOT public.is_royal_pass_active(v_uid) THEN
    RETURN jsonb_build_object('eligible', false);
  END IF;

  SELECT started_at, post_id, expires_at
    INTO v_last, v_post, v_expires
  FROM public.boosts
  WHERE user_id = v_uid AND source = 'royal_pass_daily'
  ORDER BY started_at DESC
  LIMIT 1;

  IF v_last IS NOT NULL AND v_last >= (date_trunc('day', now() at time zone 'utc') at time zone 'utc') THEN
    RETURN jsonb_build_object(
      'eligible', true,
      'claimed_today', true,
      'post_id', v_post,
      'expires_at', v_expires
    );
  END IF;

  RETURN jsonb_build_object('eligible', true, 'claimed_today', false);
END $$;

REVOKE ALL ON FUNCTION public.royal_pass_daily_boost_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.royal_pass_daily_boost_status() TO authenticated;