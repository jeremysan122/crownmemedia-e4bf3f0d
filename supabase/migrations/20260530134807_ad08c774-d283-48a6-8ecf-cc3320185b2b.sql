-- Hide profiles.first_name and profiles.last_name from the public Data API.
-- These are PII and only need to be readable by the owning user (already
-- served via SECURITY DEFINER function public.get_my_profile() and writes
-- via owner-scoped policies). Direct app reads via supabase.from('profiles')
-- never select these columns.
DO $$
DECLARE
  v_cols text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
    INTO v_cols
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name   = 'profiles'
     AND column_name NOT IN ('first_name', 'last_name');

  -- Drop the blanket table-level SELECT, then re-grant only on safe columns.
  EXECUTE 'REVOKE SELECT ON public.profiles FROM anon, authenticated';
  EXECUTE format('GRANT SELECT (%s) ON public.profiles TO anon, authenticated', v_cols);
END$$;

-- Owner-scoped writes already enforced by RLS; UPDATE still needs to touch
-- first_name/last_name when the owner edits their profile, so re-grant
-- table-level UPDATE/INSERT/DELETE to authenticated (RLS scopes the row).
GRANT INSERT, UPDATE, DELETE ON public.profiles TO authenticated;