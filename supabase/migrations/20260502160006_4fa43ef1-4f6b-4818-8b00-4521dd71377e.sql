-- Shared touch_updated_at trigger function (idempotent)
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE public.royal_pass_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  stripe_price_id text NOT NULL,
  usd numeric NOT NULL,
  interval text NOT NULL DEFAULT 'month' CHECK (interval IN ('month','year')),
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.royal_pass_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Royal Pass plans viewable by authenticated"
  ON public.royal_pass_plans FOR SELECT TO authenticated
  USING (active = true OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins manage royal pass plans"
  ON public.royal_pass_plans FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_royal_pass_plans_updated
  BEFORE UPDATE ON public.royal_pass_plans
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.royal_pass_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  plan_id uuid REFERENCES public.royal_pass_plans(id),
  stripe_customer_id text,
  stripe_subscription_id text UNIQUE,
  status text NOT NULL DEFAULT 'incomplete',
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_royal_pass_sub_user ON public.royal_pass_subscriptions(user_id);
CREATE INDEX idx_royal_pass_sub_status ON public.royal_pass_subscriptions(status);

ALTER TABLE public.royal_pass_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own royal pass"
  ON public.royal_pass_subscriptions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins manage royal pass subs"
  ON public.royal_pass_subscriptions FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_royal_pass_subs_updated
  BEFORE UPDATE ON public.royal_pass_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.is_royal_pass_active(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.royal_pass_subscriptions
    WHERE user_id = _user_id
      AND status IN ('active','trialing')
      AND (current_period_end IS NULL OR current_period_end > now())
  );
$$;

INSERT INTO public.royal_pass_plans (name, description, stripe_price_id, usd, interval, sort_order, active)
VALUES ('Royal Pass · Monthly',
        'Permanent Crown Shield, daily Royal Boost, royal-tier glow, priority placement.',
        'price_royal_pass_monthly_placeholder', 9.99, 'month', 0, true);