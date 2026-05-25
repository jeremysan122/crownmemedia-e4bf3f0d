-- Make handle_new_user OAuth-aware: Apple/Google name + avatar capture, hidden email handling, unique usernames
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
  -- Resolve full name from common OAuth fields (Apple sends `name` only on first sign-in)
  v_full_name := nullif(trim(coalesce(
    v_meta->>'full_name',
    v_meta->>'name',
    nullif(trim(coalesce(v_meta->>'given_name','') || ' ' || coalesce(v_meta->>'family_name','')), '')
  )), '');

  -- Username: explicit -> name slug -> email local-part -> user id fragment
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
    (id, email, username, dob, age_confirmed, city, state, country, profile_photo_url, bio)
  values
    (new.id, v_email, v_username, v_dob,
     -- Email/password signups already gated by AgeGate; OAuth users must confirm later
     case when v_provider = 'email' then true else false end,
     v_city, v_state, v_country, v_photo,
     case when v_full_name is not null then v_full_name else '' end)
  on conflict (id) do nothing;

  insert into public.user_roles (user_id, role)
  values (new.id, 'user')
  on conflict do nothing;

  return new;
end $function$;