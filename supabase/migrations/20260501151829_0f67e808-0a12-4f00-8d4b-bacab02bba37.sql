-- 1) Split sensitive profile fields into a private table owned by the user
CREATE TABLE IF NOT EXISTS public.profiles_private (
  id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  email text,
  dob date NOT NULL DEFAULT '2000-01-01',
  age_confirmed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles_private ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owner reads private profile" ON public.profiles_private;
CREATE POLICY "Owner reads private profile"
  ON public.profiles_private FOR SELECT
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Owner inserts private profile" ON public.profiles_private;
CREATE POLICY "Owner inserts private profile"
  ON public.profiles_private FOR INSERT
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Owner updates private profile" ON public.profiles_private;
CREATE POLICY "Owner updates private profile"
  ON public.profiles_private FOR UPDATE
  USING (auth.uid() = id);

-- Backfill existing data from profiles
INSERT INTO public.profiles_private (id, email, dob, age_confirmed)
SELECT id, email, dob, age_confirmed FROM public.profiles
ON CONFLICT (id) DO NOTHING;

-- Drop sensitive columns from public.profiles (they live in profiles_private now)
ALTER TABLE public.profiles DROP COLUMN IF EXISTS email;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS dob;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS age_confirmed;

-- Update handle_new_user trigger to write to both tables
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_provider text := coalesce(new.raw_app_meta_data->>'provider', 'email');
  v_username text;
  v_base_username text;
  v_dob date;
  v_city text;
  v_state text;
  v_country text;
  v_photo text;
  v_full_name text;
  v_email text := new.email;
  v_suffix int := 0;
begin
  v_full_name := nullif(trim(coalesce(
    v_meta->>'full_name',
    v_meta->>'name',
    nullif(trim(coalesce(v_meta->>'given_name','') || ' ' || coalesce(v_meta->>'family_name','')), '')
  )), '');

  v_base_username := lower(regexp_replace(
    coalesce(
      v_meta->>'username',
      v_meta->>'preferred_username',
      v_full_name,
      split_part(coalesce(v_email, ''), '@', 1),
      'royal_' || substr(new.id::text, 1, 8)
    ),
    '[^a-z0-9_.]+', '', 'g'
  ));
  if v_base_username is null or length(v_base_username) < 3 then
    v_base_username := 'royal_' || substr(new.id::text, 1, 8);
  end if;
  v_base_username := substr(v_base_username, 1, 20);
  v_username := v_base_username;
  while exists (select 1 from public.profiles where username = v_username) loop
    v_suffix := v_suffix + 1;
    v_username := substr(v_base_username, 1, 20) || v_suffix::text;
  end loop;

  v_dob := coalesce((v_meta->>'dob')::date, '2000-01-01'::date);
  v_city := v_meta->>'city';
  v_state := v_meta->>'state';
  v_country := v_meta->>'country';
  v_photo := coalesce(v_meta->>'profile_photo_url', v_meta->>'avatar_url', v_meta->>'picture');

  insert into public.profiles
    (id, username, city, state, country, profile_photo_url, bio)
  values
    (new.id, v_username, v_city, v_state, v_country, v_photo,
     case when v_full_name is not null then v_full_name else '' end)
  on conflict (id) do nothing;

  insert into public.profiles_private (id, email, dob, age_confirmed)
  values (new.id, v_email, v_dob,
          case when v_provider = 'email' then true else false end)
  on conflict (id) do nothing;

  insert into public.user_roles (user_id, role)
  values (new.id, 'user')
  on conflict do nothing;

  return new;
end $function$;

-- Update get_my_profile_sensitive helper to read from new table
CREATE OR REPLACE FUNCTION public.get_my_profile_sensitive()
 RETURNS TABLE(email text, dob date)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT email, dob FROM public.profiles_private WHERE id = auth.uid();
$function$;

-- 2) Lock down Realtime channel subscriptions
-- Require authenticated users and only allow subscribing to topics that match
-- their own auth.uid() (used for per-user notification/DM channels).
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read postgres_changes" ON realtime.messages;
CREATE POLICY "Authenticated can read postgres_changes"
  ON realtime.messages FOR SELECT
  TO authenticated
  USING (
    -- Allow the broadcast/presence/postgres_changes extension traffic only
    -- when the topic is the user's own id, or when it's a public topic
    -- (postgres_changes still re-checks underlying table RLS).
    extension = 'postgres_changes'
    OR (extension IN ('broadcast','presence') AND realtime.topic() = auth.uid()::text)
  );
