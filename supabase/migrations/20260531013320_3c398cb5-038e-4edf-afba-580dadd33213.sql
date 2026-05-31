-- ============================================================
-- Royal Boosts: wire effects to denormalized post columns
-- and require post selection for post-targeted boosts.
-- ============================================================

-- 1) Denormalized boost-window columns on posts
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS royal_boost_until   timestamptz,
  ADD COLUMN IF NOT EXISTS vote_boost_until    timestamptz,
  ADD COLUMN IF NOT EXISTS spotlight_until     timestamptz,
  ADD COLUMN IF NOT EXISTS crown_shield_until  timestamptz;

CREATE INDEX IF NOT EXISTS idx_posts_vote_boost_until  ON public.posts (vote_boost_until) WHERE vote_boost_until IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_posts_spotlight_until   ON public.posts (spotlight_until)  WHERE spotlight_until  IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_posts_royal_boost_until ON public.posts (royal_boost_until) WHERE royal_boost_until IS NOT NULL;

-- 2) Trigger: when a boost is inserted/updated with a post_id, push expiry onto posts
CREATE OR REPLACE FUNCTION public.trg_sync_boost_to_post()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_col text;
  v_existing timestamptz;
BEGIN
  IF NEW.post_id IS NULL OR NOT NEW.active OR NEW.expires_at IS NULL THEN
    RETURN NEW;
  END IF;

  v_col := CASE NEW.boost_type::text
    WHEN 'royal_boost'     THEN 'royal_boost_until'
    WHEN 'vote_boost'      THEN 'vote_boost_until'
    WHEN 'crown_spotlight' THEN 'spotlight_until'
    WHEN 'crown_shield'    THEN 'crown_shield_until'
    ELSE NULL
  END;
  IF v_col IS NULL THEN RETURN NEW; END IF;

  -- Take the later of (existing expiry, this expiry) so stacking extends
  EXECUTE format(
    'UPDATE public.posts SET %I = GREATEST(COALESCE(%I, ''epoch''::timestamptz), $1) WHERE id = $2',
    v_col, v_col
  ) USING NEW.expires_at, NEW.post_id;

  -- Trigger recalc so royal_boost takes effect immediately
  IF NEW.boost_type::text = 'royal_boost' THEN
    PERFORM public.recalc_post_score(NEW.post_id);
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS boosts_sync_to_post ON public.boosts;
CREATE TRIGGER boosts_sync_to_post
  AFTER INSERT OR UPDATE ON public.boosts
  FOR EACH ROW EXECUTE FUNCTION public.trg_sync_boost_to_post();

-- 3) Update recalc_post_score to read denormalized column (works whether boost row sets post_id or not)
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
begin
  select count(*) filter (where vote_type='crown'),
         count(*) filter (where vote_type='fire'),
         count(*) filter (where vote_type='diamond')
    into v_crown, v_fire, v_diamond
  from public.votes where post_id = _post_id;

  select count(*) into v_comments from public.comments where post_id = _post_id and is_removed = false;
  select coalesce(share_count,0), coalesce(battle_wins,0), royal_boost_until
    into v_shares, v_battle, v_boost_until
  from public.posts where id = _post_id;

  if v_boost_until is not null and v_boost_until > now() then
    v_boost := 1.5;
  end if;

  v_base := v_crown + (v_fire * 0.5) + (v_diamond * 1.5);
  v_score := (v_base + (v_base * (v_comments * 0.01)) + (v_shares * 0.25) + (v_battle * 5)) * v_boost;

  update public.posts
    set crown_score = v_score,
        vote_count = v_crown + v_fire + v_diamond,
        comment_count = v_comments
  where id = _post_id;
end $$;

-- 4) Update refresh_crowns_for_post to honor crown_shield on current holder
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

      -- Check if there's an active crown holder that differs from top
      select c.user_id, c.post_id into current_crown
      from public.crowns c
      where c.region_type = s::public.region_type
        and c.region_name = region_val
        and c.category = cat
        and c.active = true
      limit 1;

      -- If different holder AND current holder's crown post has active shield, SKIP displacement
      if current_crown.user_id is not null
         and current_crown.user_id <> top_post.user_id then
        select coalesce(crown_shield_until > now(), false) into shield_active
        from public.posts where id = current_crown.post_id;
        if shield_active then
          -- Update score for the shielded crown to current post's score so leaderboard math stays consistent
          update public.crowns set crown_score = (select crown_score from public.posts where id = current_crown.post_id)
            where region_type = s::public.region_type and region_name = region_val and category = cat and active = true;
          continue; -- skip to next category, do not displace
        end if;
      end if;

      -- Normal flow: deactivate stale, insert/update active
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

-- 5) Update purchase_boost RPC to accept optional p_post_id, require it for post-targeted boosts
DROP FUNCTION IF EXISTS public.purchase_boost(text, integer, numeric);
DROP FUNCTION IF EXISTS public.purchase_boost(text, integer, numeric, uuid);

CREATE OR REPLACE FUNCTION private.purchase_boost(
  _uid uuid,
  p_boost_type text,
  p_duration_hours integer,
  p_cost_shekels numeric,
  p_post_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance numeric;
  v_id uuid;
  v_cost numeric;
  v_label text;
  v_post_owner uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_duration_hours IS NULL OR p_duration_hours <= 0 OR p_duration_hours > 24*30 THEN
    RAISE EXCEPTION 'Invalid duration';
  END IF;

  v_cost := CASE p_boost_type
    WHEN 'royal_boost' THEN 500
    WHEN 'vote_boost' THEN 300
    WHEN 'crown_spotlight' THEN 1000
    WHEN 'profile_glow' THEN 200
    WHEN 'crown_shield' THEN 800
    ELSE NULL
  END;
  IF v_cost IS NULL THEN RAISE EXCEPTION 'Invalid boost type'; END IF;

  -- post-targeted boosts MUST have a valid post owned by buyer
  IF p_boost_type IN ('royal_boost','vote_boost','crown_spotlight','crown_shield') THEN
    IF p_post_id IS NULL THEN RAISE EXCEPTION 'post_id required for %', p_boost_type; END IF;
    SELECT user_id INTO v_post_owner FROM public.posts WHERE id = p_post_id AND is_removed = false;
    IF v_post_owner IS NULL THEN RAISE EXCEPTION 'Post not found'; END IF;
    IF v_post_owner <> _uid THEN RAISE EXCEPTION 'You can only boost your own posts'; END IF;
  ELSE
    p_post_id := NULL; -- profile_glow is user-level
  END IF;

  v_label := initcap(replace(p_boost_type, '_', ' '));

  SELECT shekel_balance INTO v_balance FROM public.wallets WHERE user_id = _uid FOR UPDATE;
  IF v_balance IS NULL THEN
    INSERT INTO public.wallets (user_id) VALUES (_uid);
    v_balance := 12450;
  END IF;
  IF v_balance < v_cost THEN RAISE EXCEPTION 'Insufficient Shekels'; END IF;

  UPDATE public.wallets
    SET shekel_balance = shekel_balance - v_cost,
        total_spent = total_spent + v_cost,
        updated_at = now()
    WHERE user_id = _uid;

  INSERT INTO public.boosts (user_id, post_id, boost_type, active, expires_at)
  VALUES (_uid, p_post_id, p_boost_type::boost_type, true, now() + make_interval(hours => p_duration_hours))
  RETURNING id INTO v_id;

  INSERT INTO public.shekel_ledger (user_id, kind, shekels_delta, label, reference_id, metadata)
  VALUES (_uid, 'boost_purchase', -v_cost, v_label || ' boost', v_id,
          jsonb_build_object('boost_type', p_boost_type, 'duration_hours', p_duration_hours, 'post_id', p_post_id));

  RETURN jsonb_build_object('success', true, 'boost_id', v_id, 'cost', v_cost);
END $$;

CREATE OR REPLACE FUNCTION public.purchase_boost(
  p_boost_type text,
  p_duration_hours integer DEFAULT 24,
  p_cost_shekels numeric DEFAULT 500,
  p_post_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  RETURN private.purchase_boost(auth.uid(), p_boost_type, p_duration_hours, p_cost_shekels, p_post_id);
END $$;

REVOKE ALL ON FUNCTION public.purchase_boost(text, integer, numeric, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purchase_boost(text, integer, numeric, uuid) TO authenticated;
