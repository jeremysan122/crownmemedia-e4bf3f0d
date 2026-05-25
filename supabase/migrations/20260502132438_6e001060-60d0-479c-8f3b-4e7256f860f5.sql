
CREATE OR REPLACE FUNCTION public.qual_or_check_contains(_haystack text, _needle text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$ SELECT position(lower(_needle) in lower(_haystack)) > 0 $$;

REVOKE ALL ON FUNCTION public.qual_or_check_contains(text, text) FROM PUBLIC, anon;
