CREATE OR REPLACE FUNCTION public.refresh_crowns_for_post(_post_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p record;
  s text;
  region_val text;
  top_post record;
  cat public.crown_category;
  cats public.crown_category[] := array['overall','best_style','most_creative','most_popular','best_look','best_outfit'];
  current_crown record;
  shield_active boolean;
  pass_active boolean;
  affected_users uuid[] := ARRAY[]::uuid[];
  deactivated_users uuid[];
BEGIN
  SELECT * INTO p FROM public.posts WHERE id = _post_id;
  IF NOT FOUND THEN RETURN; END IF;

  affected_users := array_append(affected_users, p.user_id);

  FOREACH s IN ARRAY ARRAY['city','state','country','global'] LOOP
    IF s = 'city' THEN region_val := p.city;
    ELSIF s = 'state' THEN region_val := p.state;
    ELSIF s = 'country' THEN region_val := p.country;
    ELSE region_val := 'Global';
    END IF;

    IF region_val IS NULL OR region_val = '' THEN CONTINUE; END IF;

    FOREACH cat IN ARRAY cats LOOP
      top_post := NULL;
      current_crown := NULL;
      deactivated_users := ARRAY[]::uuid[];

      SELECT po.id, po.user_id, po.crown_score INTO top_post
      FROM public.posts po
      WHERE po.is_removed = false
        AND po.category = cat
        AND ((s = 'city' AND po.city = region_val)
          OR (s = 'state' AND po.state = region_val)
          OR (s = 'country' AND po.country = region_val)
          OR (s = 'global'))
      ORDER BY po.crown_score DESC, po.created_at ASC
      LIMIT 1;

      IF top_post.id IS NULL THEN CONTINUE; END IF;
      affected_users := array_append(affected_users, top_post.user_id);

      SELECT c.user_id, c.post_id INTO current_crown
      FROM public.crowns c
      WHERE c.region_type = s::public.region_type
        AND c.region_name = region_val
        AND c.category = cat
        AND c.active = true
      ORDER BY c.created_at ASC
      LIMIT 1;

      IF current_crown.user_id IS NOT NULL THEN
        affected_users := array_append(affected_users, current_crown.user_id);
      END IF;

      IF current_crown.user_id IS NOT NULL
         AND current_crown.user_id <> top_post.user_id THEN
        SELECT COALESCE(crown_shield_until > now(), false) INTO shield_active
        FROM public.posts WHERE id = current_crown.post_id;

        SELECT public.is_royal_pass_active(current_crown.user_id) INTO pass_active;

        IF shield_active OR pass_active THEN
          UPDATE public.crowns
          SET crown_score = (SELECT crown_score FROM public.posts WHERE id = current_crown.post_id)
          WHERE region_type = s::public.region_type
            AND region_name = region_val
            AND category = cat
            AND active = true
            AND user_id = current_crown.user_id;
          CONTINUE;
        END IF;
      END IF;

      WITH changed AS (
        UPDATE public.crowns
        SET active = false,
            ended_at = now()
        WHERE region_type = s::public.region_type
          AND region_name = region_val
          AND category = cat
          AND active = true
          AND user_id <> top_post.user_id
        RETURNING user_id
      )
      SELECT COALESCE(array_agg(user_id), ARRAY[]::uuid[]) INTO deactivated_users
      FROM changed;

      affected_users := affected_users || deactivated_users;

      IF NOT EXISTS (
        SELECT 1
        FROM public.crowns
        WHERE region_type = s::public.region_type
          AND region_name = region_val
          AND category = cat
          AND active = true
          AND user_id = top_post.user_id
      ) THEN
        INSERT INTO public.crowns (user_id, post_id, region_type, region_name, category, title, crown_score)
        VALUES (top_post.user_id, top_post.id, s::public.region_type, region_val, cat,
                'Holder of ' || region_val || ' (' || cat::text || ')', top_post.crown_score);
      ELSE
        UPDATE public.crowns
        SET crown_score = top_post.crown_score,
            post_id = top_post.id
        WHERE region_type = s::public.region_type
          AND region_name = region_val
          AND category = cat
          AND active = true
          AND user_id = top_post.user_id;
      END IF;
    END LOOP;
  END LOOP;

  UPDATE public.profiles p2
  SET crowns_held = (SELECT count(*) FROM public.crowns WHERE user_id = p2.id AND active),
      crowns_total = (SELECT count(*) FROM public.crowns WHERE user_id = p2.id)
  WHERE p2.id IN (
    SELECT DISTINCT user_id
    FROM unnest(affected_users) AS user_id
    WHERE user_id IS NOT NULL
  );
END;
$$;