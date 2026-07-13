
-- =========================================================================
-- WAVE 3: Checkpoint reward granting, frame ownership, public read RPCs
-- =========================================================================

-- ---------- 1) GRANT CHECKPOINT REWARDS ----------
-- Reads achievement_definitions.checkpoint_rewards (jsonb array of
--   { checkpoint: 25|50|75|100, reward_type: 'badge'|'title'|'frame_preview'|'frame_permanent', reward_id?: uuid, metadata?: jsonb }
-- ) and materializes any rewards <= _reached_checkpoint into
-- user_achievement_rewards. Idempotent by unique (user, ach, checkpoint, reward_type).
-- Also creates the corresponding user_avatar_frames rows for frame_preview / frame_permanent
-- and files a `system` notification per newly-granted reward.
CREATE OR REPLACE FUNCTION public.grant_achievement_checkpoint_rewards(
  _user_id uuid,
  _achievement_id uuid,
  _reached_checkpoint int
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_def public.achievement_definitions;
  v_reward jsonb;
  v_cp int;
  v_type text;
  v_reward_id uuid;
  v_meta jsonb;
  v_frame_id uuid;
  v_expires timestamptz;
  v_granted int := 0;
  v_inserted uuid;
  v_frame_row_id uuid;
  v_notif_title text;
BEGIN
  IF _reached_checkpoint < 25 THEN RETURN 0; END IF;

  SELECT * INTO v_def FROM public.achievement_definitions
   WHERE id = _achievement_id AND is_active = true;
  IF NOT FOUND THEN RETURN 0; END IF;

  FOR v_reward IN
    SELECT value FROM jsonb_array_elements(COALESCE(v_def.checkpoint_rewards,'[]'::jsonb))
  LOOP
    v_cp := NULLIF(v_reward->>'checkpoint','')::int;
    IF v_cp IS NULL OR v_cp > _reached_checkpoint THEN CONTINUE; END IF;

    v_type := COALESCE(v_reward->>'reward_type','badge');
    v_reward_id := NULLIF(v_reward->>'reward_id','')::uuid;
    v_meta := COALESCE(v_reward->'metadata','{}'::jsonb);

    -- Frame preview / permanent: figure out which frame we're granting
    v_frame_id := NULL;
    IF v_type IN ('frame_preview','frame_permanent') THEN
      v_frame_id := COALESCE(v_reward_id, v_def.avatar_frame_id);
      IF v_frame_id IS NULL THEN CONTINUE; END IF;
    END IF;

    -- Materialize reward record
    INSERT INTO public.user_achievement_rewards
      (user_id, achievement_id, checkpoint, reward_type, reward_id, expires_at, metadata)
    VALUES
      (_user_id, _achievement_id, v_cp, v_type, COALESCE(v_frame_id, v_reward_id),
       CASE WHEN v_type='frame_preview' THEN now() + interval '7 days' ELSE NULL END,
       v_meta)
    ON CONFLICT (user_id, achievement_id, checkpoint, reward_type) DO NOTHING
    RETURNING id INTO v_inserted;

    IF v_inserted IS NULL THEN CONTINUE; END IF;
    v_granted := v_granted + 1;

    -- Materialize frame ownership when applicable
    IF v_type = 'frame_preview' THEN
      v_expires := now() + interval '7 days';
      INSERT INTO public.user_avatar_frames
        (user_id, avatar_frame_id, achievement_id, grant_source, grant_source_id,
         expires_at, is_permanent)
      VALUES
        (_user_id, v_frame_id, _achievement_id, 'achievement_preview', v_inserted,
         v_expires, false)
      ON CONFLICT (user_id, avatar_frame_id) DO UPDATE
        SET expires_at = GREATEST(COALESCE(public.user_avatar_frames.expires_at, EXCLUDED.expires_at), EXCLUDED.expires_at),
            is_revoked = false,
            revoked_at = NULL,
            revocation_reason = NULL,
            updated_at = now()
      RETURNING id INTO v_frame_row_id;
    ELSIF v_type = 'frame_permanent' THEN
      INSERT INTO public.user_avatar_frames
        (user_id, avatar_frame_id, achievement_id, grant_source, grant_source_id,
         expires_at, is_permanent)
      VALUES
        (_user_id, v_frame_id, _achievement_id, 'achievement', v_inserted, NULL, true)
      ON CONFLICT (user_id, avatar_frame_id) DO UPDATE
        SET is_permanent = true,
            expires_at = NULL,
            is_revoked = false,
            revoked_at = NULL,
            revocation_reason = NULL,
            updated_at = now()
      RETURNING id INTO v_frame_row_id;
    END IF;

    -- Notify the user (best-effort)
    v_notif_title := CASE v_type
      WHEN 'badge' THEN 'New achievement badge: ' || v_def.name
      WHEN 'title' THEN 'New title unlocked: ' || v_def.name
      WHEN 'frame_preview' THEN '7-day frame preview: ' || v_def.name
      WHEN 'frame_permanent' THEN 'Frame unlocked: ' || v_def.name
      ELSE 'Achievement reward: ' || v_def.name
    END;

    BEGIN
      INSERT INTO public.notifications (user_id, type, title, body, payload)
      VALUES (
        _user_id, 'system'::notification_type, v_notif_title,
        v_def.description,
        jsonb_build_object(
          'kind','achievement_reward',
          'achievement_id', _achievement_id,
          'achievement_slug', v_def.slug,
          'checkpoint', v_cp,
          'reward_type', v_type,
          'frame_id', v_frame_id,
          'reward_row_id', v_inserted
        )
      );
    EXCEPTION WHEN OTHERS THEN
      -- swallow notification failures; reward grant is source of truth
      NULL;
    END;
  END LOOP;

  RETURN v_granted;
END;
$$;

REVOKE ALL ON FUNCTION public.grant_achievement_checkpoint_rewards(uuid,uuid,int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.grant_achievement_checkpoint_rewards(uuid,uuid,int) TO service_role;

-- ---------- 2) TRIGGER: fire reward grant on checkpoint advance ----------
CREATE OR REPLACE FUNCTION public.tg_ach_progress_checkpoint_rewards()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old int;
  v_new int;
BEGIN
  v_new := COALESCE(NEW.highest_checkpoint, 0);
  v_old := COALESCE(OLD.highest_checkpoint, 0);
  IF v_new > v_old AND v_new >= 25 THEN
    PERFORM public.grant_achievement_checkpoint_rewards(NEW.user_id, NEW.achievement_id, v_new);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS _ach_progress_checkpoint_rewards ON public.user_achievement_progress;
CREATE TRIGGER _ach_progress_checkpoint_rewards
  AFTER INSERT OR UPDATE OF highest_checkpoint ON public.user_achievement_progress
  FOR EACH ROW EXECUTE FUNCTION public.tg_ach_progress_checkpoint_rewards();

-- ---------- 3) PUBLIC READ RPC: my_achievements ----------
CREATE OR REPLACE FUNCTION public.my_achievements()
RETURNS TABLE(
  achievement_id uuid,
  slug text,
  name text,
  description text,
  collection_id uuid,
  collection_slug text,
  rarity text,
  is_founder_only boolean,
  is_secret boolean,
  avatar_frame_id uuid,
  requirement_logic jsonb,
  checkpoint_rewards jsonb,
  progress jsonb,
  completion_percent numeric,
  highest_checkpoint int,
  status text,
  started_at timestamptz,
  completed_at timestamptz,
  rewards jsonb,
  gates jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_qad int;
  v_weeks int;
  v_age_days int;
BEGIN
  IF v_user IS NULL THEN RETURN; END IF;

  SELECT count(*) INTO v_qad FROM public.user_active_days WHERE user_id = v_user;
  SELECT count(DISTINCT date_trunc('week', activity_date)) INTO v_weeks
    FROM public.user_active_days WHERE user_id = v_user;
  SELECT GREATEST(0, EXTRACT(EPOCH FROM (now() - u.created_at))/86400)::int
    INTO v_age_days FROM auth.users u WHERE u.id = v_user;

  RETURN QUERY
  SELECT
    ad.id,
    ad.slug, ad.name, ad.description,
    ad.collection_id, c.slug,
    ad.rarity,
    ad.is_founder_only, ad.is_secret,
    ad.avatar_frame_id,
    ad.requirement_logic,
    ad.checkpoint_rewards,
    COALESCE(p.progress, '{}'::jsonb),
    COALESCE(p.completion_percent, 0)::numeric,
    COALESCE(p.highest_checkpoint, 0),
    COALESCE(p.status, 'in_progress'),
    p.started_at,
    p.completed_at,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'checkpoint', r.checkpoint,
        'reward_type', r.reward_type,
        'reward_id', r.reward_id,
        'granted_at', r.granted_at,
        'expires_at', r.expires_at,
        'is_revoked', r.is_revoked
      ) ORDER BY r.checkpoint)
      FROM public.user_achievement_rewards r
      WHERE r.user_id = v_user AND r.achievement_id = ad.id AND r.is_revoked = false
    ), '[]'::jsonb),
    jsonb_build_object(
      'account_age_days', v_age_days,
      'required_account_age_days', ad.minimum_account_age_days,
      'qualified_active_days', v_qad,
      'required_qualified_active_days', ad.minimum_qualified_active_days,
      'distinct_active_weeks', v_weeks,
      'required_distinct_active_weeks', ad.minimum_distinct_active_weeks,
      'gates_ok', (
        v_age_days >= COALESCE(ad.minimum_account_age_days,0)
        AND v_qad >= COALESCE(ad.minimum_qualified_active_days,0)
        AND v_weeks >= COALESCE(ad.minimum_distinct_active_weeks,0)
      )
    )
  FROM public.achievement_definitions ad
  LEFT JOIN public.avatar_frame_collections c ON c.id = ad.collection_id
  LEFT JOIN public.user_achievement_progress p
    ON p.achievement_id = ad.id AND p.user_id = v_user
  WHERE ad.is_active = true
    AND (ad.is_secret = false OR p.status IS NOT NULL)
    AND (ad.starts_at IS NULL OR ad.starts_at <= now())
    AND (ad.ends_at IS NULL OR ad.ends_at >= now())
  ORDER BY c.display_order NULLS LAST, ad.display_order;
END;
$$;

REVOKE ALL ON FUNCTION public.my_achievements() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_achievements() TO authenticated, service_role;

-- ---------- 4) EQUIP AVATAR FRAME ----------
-- Verifies the caller owns (or Founder-holds) the frame before setting
-- profiles.equipped_avatar_frame_id.
CREATE OR REPLACE FUNCTION public.equip_avatar_frame(_frame_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_ok boolean;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  IF _frame_id IS NULL THEN
    UPDATE public.profiles SET equipped_avatar_frame_id = NULL WHERE id = v_user;
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_avatar_frames
     WHERE user_id = v_user
       AND avatar_frame_id = _frame_id
       AND is_revoked = false
       AND (expires_at IS NULL OR expires_at > now())
  ) INTO v_ok;

  IF NOT v_ok THEN
    RAISE EXCEPTION 'You do not own this frame';
  END IF;

  UPDATE public.profiles
     SET equipped_avatar_frame_id = _frame_id
   WHERE id = v_user;
END;
$$;

REVOKE ALL ON FUNCTION public.equip_avatar_frame(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.equip_avatar_frame(uuid) TO authenticated, service_role;

-- ---------- 5) MY OWNED FRAMES ----------
CREATE OR REPLACE FUNCTION public.my_owned_avatar_frames()
RETURNS TABLE(
  frame_id uuid,
  slug text,
  name text,
  collection_slug text,
  asset_url text,
  is_permanent boolean,
  expires_at timestamptz,
  achievement_id uuid,
  granted_at timestamptz,
  equipped boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_equipped uuid;
BEGIN
  IF v_user IS NULL THEN RETURN; END IF;
  SELECT equipped_avatar_frame_id INTO v_equipped FROM public.profiles WHERE id = v_user;

  RETURN QUERY
  SELECT
    f.id, f.slug, f.name, c.slug,
    f.asset_url,
    uaf.is_permanent, uaf.expires_at,
    uaf.achievement_id, uaf.granted_at,
    (v_equipped = f.id)
  FROM public.user_avatar_frames uaf
  JOIN public.avatar_frames f ON f.id = uaf.avatar_frame_id
  LEFT JOIN public.avatar_frame_collections c ON c.id = f.collection_id
  WHERE uaf.user_id = v_user
    AND uaf.is_revoked = false
    AND (uaf.expires_at IS NULL OR uaf.expires_at > now())
  ORDER BY uaf.granted_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.my_owned_avatar_frames() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_owned_avatar_frames() TO authenticated, service_role;
