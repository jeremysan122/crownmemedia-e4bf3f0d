
-- ============ Verified Badge System ============

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS verification_plan text;

CREATE TYPE public.verification_status AS ENUM ('pending','approved','rejected','more_info_required','revoked');
CREATE TYPE public.verification_plan_type AS ENUM ('standard','subscription');

CREATE TABLE public.verification_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  plan public.verification_plan_type NOT NULL,
  status public.verification_status NOT NULL DEFAULT 'pending',
  legal_name text NOT NULL,
  category text NOT NULL,
  brand_name text,
  website_url text,
  social_links jsonb NOT NULL DEFAULT '[]'::jsonb,
  follower_count integer,
  reason text NOT NULL,
  id_document_path text,
  business_document_path text,
  selfie_path text,
  reviewer_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  review_notes text,
  reviewed_at timestamptz,
  subscription_id text,
  subscription_active boolean NOT NULL DEFAULT false,
  subscription_renews_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_verification_requests_one_pending
  ON public.verification_requests (user_id)
  WHERE status IN ('pending','more_info_required');
CREATE INDEX idx_verification_requests_status ON public.verification_requests (status, created_at DESC);
CREATE INDEX idx_verification_requests_user ON public.verification_requests (user_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.verification_requests TO authenticated;
GRANT ALL ON public.verification_requests TO service_role;

ALTER TABLE public.verification_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users view own verification requests"
  ON public.verification_requests FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "users create own verification requests"
  ON public.verification_requests FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "admin update verification requests"
  ON public.verification_requests FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "user updates own pending request"
  ON public.verification_requests FOR UPDATE TO authenticated
  USING (auth.uid() = user_id AND status IN ('pending','more_info_required'))
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER verification_requests_set_updated
  BEFORE UPDATE ON public.verification_requests
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Private documents bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('verification-docs', 'verification-docs', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "users upload own verification docs"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'verification-docs' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "users read own verification docs"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'verification-docs' AND (
    auth.uid()::text = (storage.foldername(name))[1]
    OR public.has_role(auth.uid(), 'admin')
  ));

CREATE POLICY "users delete own pending verification docs"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'verification-docs' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Submit RPC
CREATE OR REPLACE FUNCTION public.submit_verification_request(
  _plan public.verification_plan_type,
  _legal_name text,
  _category text,
  _brand_name text,
  _website_url text,
  _social_links jsonb,
  _follower_count integer,
  _reason text,
  _id_document_path text,
  _business_document_path text,
  _selfie_path text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid;
  v_total_followers int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF length(coalesce(_legal_name,'')) < 2 THEN RAISE EXCEPTION 'Legal name required'; END IF;
  IF _category NOT IN ('creator','brand','public_figure','business','journalist') THEN
    RAISE EXCEPTION 'Invalid category';
  END IF;
  IF length(coalesce(_reason,'')) < 20 THEN RAISE EXCEPTION 'Please explain why you should be verified (20+ chars)'; END IF;
  IF _id_document_path IS NULL THEN RAISE EXCEPTION 'Government ID is required'; END IF;
  IF _selfie_path IS NULL THEN RAISE EXCEPTION 'Live selfie is required'; END IF;
  IF _category IN ('brand','business') AND _business_document_path IS NULL THEN
    RAISE EXCEPTION 'Brands/businesses must upload business documentation';
  END IF;

  IF _plan = 'standard' THEN
    SELECT COALESCE(followers_count, 0) INTO v_total_followers FROM public.profiles WHERE id = v_uid;
    v_total_followers := GREATEST(v_total_followers, COALESCE(_follower_count, 0));
    IF v_total_followers < 100000 AND _category NOT IN ('brand','business','public_figure','journalist') THEN
      RAISE EXCEPTION 'The free verification path requires 100,000+ followers or an established brand/business/public-figure status. Consider the subscription plan for easier verification.';
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM public.verification_requests
             WHERE user_id = v_uid AND status IN ('pending','more_info_required')) THEN
    RAISE EXCEPTION 'You already have a verification request in review';
  END IF;

  INSERT INTO public.verification_requests (
    user_id, plan, legal_name, category, brand_name, website_url,
    social_links, follower_count, reason,
    id_document_path, business_document_path, selfie_path
  ) VALUES (
    v_uid, _plan, _legal_name, _category, _brand_name, _website_url,
    COALESCE(_social_links, '[]'::jsonb), _follower_count, _reason,
    _id_document_path, _business_document_path, _selfie_path
  ) RETURNING id INTO v_id;

  INSERT INTO public.notifications (user_id, type, title, body, payload)
  VALUES (v_uid, 'system', 'Verification request received',
    'We will review your submission within 3–7 business days.',
    jsonb_build_object('verification_id', v_id, 'link', '/verification'));

  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION public.submit_verification_request(public.verification_plan_type, text, text, text, text, jsonb, integer, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_verification_request(public.verification_plan_type, text, text, text, text, jsonb, integer, text, text, text, text) TO authenticated;

-- Admin decide
CREATE OR REPLACE FUNCTION public.admin_decide_verification(
  _request_id uuid, _decision public.verification_status, _notes text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_req public.verification_requests%ROWTYPE;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF _decision NOT IN ('approved','rejected','more_info_required','revoked') THEN
    RAISE EXCEPTION 'Invalid decision';
  END IF;
  SELECT * INTO v_req FROM public.verification_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;

  UPDATE public.verification_requests
     SET status = _decision, review_notes = _notes,
         reviewer_id = auth.uid(), reviewed_at = now()
   WHERE id = _request_id;

  IF _decision = 'approved' THEN
    UPDATE public.profiles
       SET verified = true, verified_at = COALESCE(verified_at, now()),
           verification_plan = v_req.plan::text
     WHERE id = v_req.user_id;
    INSERT INTO public.notifications (user_id, type, title, body, payload)
    VALUES (v_req.user_id, 'system', '✅ You are verified!',
      'Your CrownMe profile now shows the verified badge.',
      jsonb_build_object('verification_id', v_req.id, 'link', '/me'));
  ELSIF _decision = 'rejected' THEN
    INSERT INTO public.notifications (user_id, type, title, body, payload)
    VALUES (v_req.user_id, 'system', 'Verification rejected',
      COALESCE(_notes, 'Your verification request was not approved.'),
      jsonb_build_object('verification_id', v_req.id, 'link', '/verification'));
  ELSIF _decision = 'more_info_required' THEN
    INSERT INTO public.notifications (user_id, type, title, body, payload)
    VALUES (v_req.user_id, 'system', 'More info needed for verification',
      COALESCE(_notes, 'Please provide additional documentation.'),
      jsonb_build_object('verification_id', v_req.id, 'link', '/verification'));
  ELSIF _decision = 'revoked' THEN
    UPDATE public.profiles SET verified = false, verification_plan = NULL WHERE id = v_req.user_id;
    INSERT INTO public.notifications (user_id, type, title, body, payload)
    VALUES (v_req.user_id, 'system', 'Verification revoked',
      COALESCE(_notes, 'Your verified status has been revoked.'),
      jsonb_build_object('verification_id', v_req.id, 'link', '/verification'));
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.admin_decide_verification(uuid, public.verification_status, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_decide_verification(uuid, public.verification_status, text) TO authenticated;

-- ============ Web Push Subscriptions ============

CREATE TABLE public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_push_subscriptions_user ON public.push_subscriptions (user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage own push subs"
  ON public.push_subscriptions FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.save_push_subscription(
  _endpoint text, _p256dh text, _auth text, _user_agent text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  INSERT INTO public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  VALUES (v_uid, _endpoint, _p256dh, _auth, _user_agent)
  ON CONFLICT (endpoint) DO UPDATE
     SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh,
         auth = EXCLUDED.auth, user_agent = EXCLUDED.user_agent,
         last_seen_at = now()
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION public.save_push_subscription(text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_push_subscription(text, text, text, text) TO authenticated;
