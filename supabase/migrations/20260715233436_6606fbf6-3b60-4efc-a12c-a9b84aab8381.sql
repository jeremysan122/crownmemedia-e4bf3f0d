
CREATE TABLE IF NOT EXISTS public.royal_pass_gifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  recipient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_session_id text UNIQUE,
  stripe_payment_intent_id text,
  environment text NOT NULL DEFAULT 'sandbox' CHECK (environment IN ('sandbox','live')),
  amount_usd numeric NOT NULL DEFAULT 0,
  months_granted integer NOT NULL DEFAULT 1 CHECK (months_granted > 0),
  message text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','granted','refunded','failed')),
  granted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_royal_pass_gifts_buyer ON public.royal_pass_gifts(buyer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_royal_pass_gifts_recipient ON public.royal_pass_gifts(recipient_id, created_at DESC);

GRANT SELECT ON public.royal_pass_gifts TO authenticated;
GRANT ALL ON public.royal_pass_gifts TO service_role;

ALTER TABLE public.royal_pass_gifts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Buyers see their sent gifts"
  ON public.royal_pass_gifts FOR SELECT TO authenticated
  USING (auth.uid() = buyer_id);

CREATE POLICY "Recipients see their received gifts"
  ON public.royal_pass_gifts FOR SELECT TO authenticated
  USING (auth.uid() = recipient_id);

CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_royal_pass_gifts_updated_at
  BEFORE UPDATE ON public.royal_pass_gifts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.grant_royal_pass_gift_period(_gift_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  gift record;
  existing record;
  base_ts timestamptz;
  new_end timestamptz;
BEGIN
  SELECT * INTO gift FROM public.royal_pass_gifts WHERE id = _gift_id FOR UPDATE;
  IF gift IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'gift_not_found');
  END IF;
  IF gift.status = 'granted' THEN
    RETURN jsonb_build_object('ok', true, 'already_granted', true);
  END IF;

  SELECT * INTO existing FROM public.royal_pass_subscriptions WHERE user_id = gift.recipient_id;

  base_ts := GREATEST(COALESCE(existing.current_period_end, now()), now());
  new_end := base_ts + make_interval(months => gift.months_granted);

  IF existing IS NULL THEN
    INSERT INTO public.royal_pass_subscriptions(
      user_id, status, current_period_start, current_period_end, cancel_at_period_end, plan_id
    ) VALUES (
      gift.recipient_id, 'active', now(), new_end, true, 'royal_pass_gift'
    );
  ELSE
    UPDATE public.royal_pass_subscriptions
       SET status = CASE WHEN status IN ('canceled','incomplete_expired','unpaid') THEN 'active' ELSE status END,
           current_period_end = new_end,
           updated_at = now()
     WHERE user_id = gift.recipient_id;
  END IF;

  BEGIN
    INSERT INTO public.royal_pass_grants(user_id, source, granted_by, months, expires_at, note)
    VALUES (gift.recipient_id, 'gift', gift.buyer_id, gift.months_granted, new_end,
            'Royal Pass gift #' || substring(gift.id::text, 1, 8));
  EXCEPTION WHEN others THEN NULL;
  END;

  UPDATE public.royal_pass_gifts
     SET status = 'granted', granted_at = now(), updated_at = now()
   WHERE id = gift.id;

  RETURN jsonb_build_object('ok', true, 'new_period_end', new_end);
END; $$;

REVOKE ALL ON FUNCTION public.grant_royal_pass_gift_period(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_royal_pass_gift_period(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.resolve_gift_recipient(_username text)
RETURNS TABLE(id uuid, username text, profile_photo_url text)
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT p.id, p.username, p.profile_photo_url
  FROM public.profiles p
  WHERE lower(p.username) = lower(_username)
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.resolve_gift_recipient(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_gift_recipient(text) TO authenticated, service_role;
