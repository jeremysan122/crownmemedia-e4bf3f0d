-- Restore missing Data API GRANTs across all public tables.
-- RLS policies already enforce row-level access; without explicit GRANTs,
-- PostgREST returns "permission denied for table ..." even for the table owner's data.

DO $$
DECLARE tbl record; has_priv boolean;
BEGIN
  FOR tbl IN
    SELECT c.relname AS table_name
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE c.relkind = 'r' AND n.nspname = 'public'
  LOOP
    SELECT EXISTS (
      SELECT 1 FROM information_schema.role_table_grants
       WHERE grantee = 'authenticated' AND table_schema='public' AND table_name=tbl.table_name
         AND privilege_type IN ('SELECT','INSERT','UPDATE','DELETE')
    ) INTO has_priv;
    IF NOT has_priv THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', tbl.table_name);
    END IF;

    SELECT EXISTS (
      SELECT 1 FROM information_schema.role_table_grants
       WHERE grantee = 'service_role' AND table_schema='public' AND table_name=tbl.table_name
         AND privilege_type IN ('SELECT','INSERT','UPDATE','DELETE')
    ) INTO has_priv;
    IF NOT has_priv THEN
      EXECUTE format('GRANT ALL ON public.%I TO service_role', tbl.table_name);
    END IF;
  END LOOP;
END $$;

-- Anon SELECT for tables whose policies already allow non-auth-scoped reads.
GRANT SELECT ON public.profiles            TO anon;
GRANT SELECT ON public.posts               TO anon;
GRANT SELECT ON public.comments            TO anon;
GRANT SELECT ON public.comment_reactions   TO anon;
GRANT SELECT ON public.votes               TO anon;
GRANT SELECT ON public.battles             TO anon;
GRANT SELECT ON public.battle_votes        TO anon;
GRANT SELECT ON public.crowns              TO anon;
GRANT SELECT ON public.follows             TO anon;
GRANT SELECT ON public.gifts               TO anon;
GRANT SELECT ON public.creator_milestones  TO anon;
GRANT SELECT ON public.rank_snapshots      TO anon;