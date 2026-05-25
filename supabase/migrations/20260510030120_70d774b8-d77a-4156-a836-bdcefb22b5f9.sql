
-- Gender enum
DO $$ BEGIN
  CREATE TYPE public.gender_type AS ENUM ('male','female','non_binary','prefer_not_to_say');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Add demographic fields to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name  text,
  ADD COLUMN IF NOT EXISTS gender     public.gender_type;

-- Track policy acceptance (private)
ALTER TABLE public.profiles_private
  ADD COLUMN IF NOT EXISTS policies_accepted_at timestamptz;

-- Update handle_new_user to capture new fields and require policy acceptance for email signups
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
  v_first text;
  v_last  text;
  v_gender public.gender_type;
  v_policies boolean;
  v_email text := new.email;
  v_suffix int := 0;
begin
  v_first := nullif(trim(coalesce(v_meta->>'first_name', v_meta->>'given_name','')), '');
  v_last  := nullif(trim(coalesce(v_meta->>'last_name',  v_meta->>'family_name','')), '');
  v_full_name := nullif(trim(coalesce(
    v_meta->>'full_name',
    v_meta->>'name',
    nullif(trim(coalesce(v_first,'') || ' ' || coalesce(v_last,'')), '')
  )), '');

  begin
    v_gender := nullif(v_meta->>'gender','')::public.gender_type;
  exception when others then v_gender := null; end;

  v_policies := coalesce((v_meta->>'policies_accepted')::boolean, false);

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

  if v_provider = 'email' and v_dob > (CURRENT_DATE - INTERVAL '18 years') then
    raise exception 'User must be 18 or older to register';
  end if;

  if v_provider = 'email' and not v_policies then
    raise exception 'You must agree to the Terms and Community Guidelines to register';
  end if;

  v_city := v_meta->>'city';
  v_state := v_meta->>'state';
  v_country := v_meta->>'country';
  v_photo := coalesce(v_meta->>'profile_photo_url', v_meta->>'avatar_url', v_meta->>'picture');

  insert into public.profiles
    (id, username, city, state, country, profile_photo_url, bio, first_name, last_name, gender)
  values
    (new.id, v_username, v_city, v_state, v_country, v_photo,
     case when v_full_name is not null then v_full_name else '' end,
     v_first, v_last, v_gender)
  on conflict (id) do nothing;

  insert into public.profiles_private (id, email, dob, age_confirmed, policies_accepted_at)
  values (new.id, v_email, v_dob,
          case when v_provider = 'email' then true else false end,
          case when v_policies then now() else null end)
  on conflict (id) do nothing;

  insert into public.user_roles (user_id, role)
  values (new.id, 'user')
  on conflict do nothing;

  return new;
end $function$;

-- RPC for the user to update their own DOB without going through the age-confirm path
CREATE OR REPLACE FUNCTION public.update_my_dob(_dob date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if _dob > (CURRENT_DATE - INTERVAL '18 years') then
    raise exception 'You must be 18 or older';
  end if;
  update public.profiles_private
    set dob = _dob, age_confirmed = true, updated_at = now()
    where id = auth.uid();
end; $$;
