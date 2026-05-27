DO $$
DECLARE tbl record;
BEGIN
  FOR tbl IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='r' AND n.nspname='public' LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', tbl.relname);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', tbl.relname);
  END LOOP;
  -- Public-read tables (safe permissive selects)
  FOR tbl IN SELECT unnest(ARRAY['profiles','posts','crowns','spin_wheel_prizes','user_roles']) AS n LOOP
    BEGIN EXECUTE format('GRANT SELECT ON public.%I TO anon', tbl.n); EXCEPTION WHEN undefined_table THEN NULL; END;
  END LOOP;
END $$;

-- Also ensure future tables auto-grant
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;