ALTER TABLE public.profiles_private
  ADD COLUMN IF NOT EXISTS onboarded_at timestamptz,
  ADD COLUMN IF NOT EXISTS welcome_email_sent_at timestamptz;