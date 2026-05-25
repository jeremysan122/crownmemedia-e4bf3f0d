-- 1) Revoke PII columns from anon role on profiles
REVOKE SELECT ON public.profiles FROM anon;

-- Grant SELECT only on non-PII columns to anon
DO $$
DECLARE
  v_cols text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ')
    INTO v_cols
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name NOT IN ('first_name', 'last_name', 'gender');
  EXECUTE 'GRANT SELECT (' || v_cols || ') ON public.profiles TO anon';
END $$;

-- 2) Tighten realtime topic policy: require uid to appear as a delimited segment
DROP POLICY IF EXISTS "Users subscribe to own topic only" ON realtime.messages;
CREATE POLICY "Users subscribe to own topic only"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  (
    extension = 'postgres_changes'
    AND realtime.topic() ~ ('(^|[^0-9a-fA-F-])' || (auth.uid())::text || '([^0-9a-fA-F-]|$)')
  )
  OR (
    extension <> 'postgres_changes'
    AND realtime.topic() = (auth.uid())::text
  )
);