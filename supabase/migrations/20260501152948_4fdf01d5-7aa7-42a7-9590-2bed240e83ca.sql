CREATE OR REPLACE FUNCTION public.dm_pair_folder(_a uuid, _b uuid)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE WHEN _a < _b
    THEN _a::text || '__' || _b::text
    ELSE _b::text || '__' || _a::text
  END;
$$;