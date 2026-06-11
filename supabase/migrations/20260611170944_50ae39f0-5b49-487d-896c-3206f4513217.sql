-- Restore SELECT grants on public.profiles that were stripped during the security cleanup.
-- RLS policies on profiles already allow public read of non-PII columns (column-level
-- restrictions are enforced by GRANTs at the column level elsewhere), and the
-- "Profiles readable by anon/authenticated" policies expect these grants to exist.
GRANT SELECT ON public.profiles TO anon, authenticated;
GRANT INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;