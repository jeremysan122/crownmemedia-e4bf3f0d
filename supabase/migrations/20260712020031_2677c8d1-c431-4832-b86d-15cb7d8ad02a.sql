
CREATE OR REPLACE FUNCTION public.use_royal_shield(_post_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  royal_active bool;
  post_owner uuid;
  post_removed bool;
  crown_row_id uuid;
  allow record;
  linked_grant_status text;
  existing_shield record;
  new_boost_id uuid;
BEGIN
  IF uid IS NULL THEN RETURN jsonb_build_object('error','unauthenticated'); END IF;
  royal_active := public.is_royal_pass_active(uid);
  IF NOT royal_active THEN RETURN jsonb_build_object('error','no_active_royal_pass'); END IF;

  SELECT p.user_id, COALESCE(p.is_removed, false)
    INTO post_owner, post_removed
    FROM public.posts p WHERE p.id = _post_id;
  IF post_owner IS NULL THEN RETURN jsonb_build_object('error','post_not_found'); END IF;
  IF post_removed THEN RETURN jsonb_build_object('error','post_removed'); END IF;
  IF post_owner <> uid THEN RETURN jsonb_build_object('error','not_post_owner'); END IF;

  SELECT c.id INTO crown_row_id FROM public.crowns c
   WHERE c.post_id = _post_id AND c.user_id = uid AND c.active = true LIMIT 1;
  IF crown_row_id IS NULL THEN RETURN jsonb_build_object('error','no_active_crown'); END IF;

  SELECT b.id, b.expires_at, b.source INTO existing_shield
    FROM public.boosts b
   WHERE b.post_id = _post_id
     AND b.boost_type = 'crown_shield'
     AND b.active = true
     AND (b.expires_at IS NULL OR b.expires_at > now())
   ORDER BY b.expires_at DESC NULLS LAST
   LIMIT 1;
  IF existing_shield.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'error','already_shielded',
      'expires_at', existing_shield.expires_at,
      'source', existing_shield.source
    );
  END IF;

  SELECT * INTO allow
    FROM public.royal_pass_shield_allowances a
   WHERE a.user_id = uid AND a.period_end > now()
   ORDER BY a.period_end DESC LIMIT 1
   FOR UPDATE;
  IF allow IS NULL THEN RETURN jsonb_build_object('error','no_allowance'); END IF;

  IF allow.royal_pass_grant_id IS NULL THEN
    RETURN jsonb_build_object('error','royal_allowance_not_linked');
  END IF;

  SELECT g.status INTO linked_grant_status
    FROM public.royal_pass_grants g
   WHERE g.id = allow.royal_pass_grant_id;
  IF linked_grant_status IS NULL THEN
    RETURN jsonb_build_object('error','royal_allowance_not_linked');
  END IF;
  IF linked_grant_status <> 'granted' THEN
    RETURN jsonb_build_object(
      'error','royal_benefits_temporarily_suspended',
      'grant_status', linked_grant_status
    );
  END IF;

  IF allow.shields_used >= allow.shields_granted THEN
    RETURN jsonb_build_object('error','no_shields_remaining');
  END IF;

  UPDATE public.royal_pass_shield_allowances a
    SET shields_used = a.shields_used + 1, updated_at = now()
    WHERE a.id = allow.id;

  INSERT INTO public.boosts (user_id, post_id, boost_type, active, started_at, expires_at, source)
  VALUES (uid, _post_id, 'crown_shield', true, now(), now() + interval '24 hours', 'royal_pass')
  RETURNING id INTO new_boost_id;

  RETURN jsonb_build_object(
    'ok', true,
    'boost_id', new_boost_id,
    'shields_used', allow.shields_used + 1,
    'shields_granted', allow.shields_granted,
    'expires_at', (now() + interval '24 hours')
  );
END; $function$;
