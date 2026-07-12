
INSERT INTO public.feature_flags (key, enabled, description)
VALUES
  ('royal_pass_public_launch', false, 'Gates the public Royal Pass sales CTA. Admins bypass. Flip to true for launch.'),
  ('royal_pass_debits_paused', false, 'Emergency kill-switch: when true, the centralized debit primitives refuse to spend.')
ON CONFLICT (key) DO NOTHING;
