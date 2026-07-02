create or replace function public.update_my_preferences(_prefs jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  allowed_bool constant text[] := array[
    'is_private',
    'default_comments_enabled',
    'watermark_enabled',
    'autosave_to_camera_roll',
    'reduce_motion',
    'larger_text',
    'high_contrast',
    'captions_default_on',
    'autoplay_cellular',
    'push_likes',
    'push_follows',
    'push_comments',
    'push_battles',
    'auto_accept_battles_from_follows'
  ];
  allowed_locale_len constant int := 10;
  allowed_tz_len constant int := 64;
  allowed_default_category_len constant int := 64;
  allowed_visibility constant text[] := array['public','followers','private'];
  allowed_sensitive  constant text[] := array['blur','show','hide'];
  allowed_scope      constant text[] := array['global','country','city'];
  k text;
  v jsonb;
  s text;
  n numeric;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;
  if _prefs is null or jsonb_typeof(_prefs) <> 'object' then
    raise exception 'invalid_payload';
  end if;

  for k, v in select key, value from jsonb_each(_prefs) loop
    if k = any(allowed_bool) then
      if jsonb_typeof(v) <> 'boolean' then raise exception 'invalid_preference_value:%', k; end if;
      execute format('update public.profiles set %I = $1 where id = $2', k)
        using (v::text)::boolean, uid;

    elsif k = 'locale' then
      if jsonb_typeof(v) <> 'string' then raise exception 'invalid_preference_value:locale'; end if;
      s := v #>> '{}';
      if length(s) = 0 or length(s) > allowed_locale_len then raise exception 'invalid_preference_value:locale'; end if;
      update public.profiles set locale = s where id = uid;

    elsif k = 'default_post_visibility' then
      s := v #>> '{}';
      if s is null or not (s = any(allowed_visibility)) then raise exception 'invalid_preference_value:default_post_visibility'; end if;
      update public.profiles set default_post_visibility = s where id = uid;

    elsif k = 'default_category' then
      if jsonb_typeof(v) = 'null' then
        update public.profiles set default_category = null where id = uid;
      else
        if jsonb_typeof(v) <> 'string' then raise exception 'invalid_preference_value:default_category'; end if;
        s := v #>> '{}';
        if length(s) = 0 or length(s) > allowed_default_category_len then raise exception 'invalid_preference_value:default_category'; end if;
        update public.profiles set default_category = s where id = uid;
      end if;

    elsif k = 'sensitive_content_mode' then
      s := v #>> '{}';
      if s is null or not (s = any(allowed_sensitive)) then raise exception 'invalid_preference_value:sensitive_content_mode'; end if;
      update public.profiles set sensitive_content_mode = s where id = uid;

    elsif k = 'default_race_scope' then
      s := v #>> '{}';
      if s is null or not (s = any(allowed_scope)) then raise exception 'invalid_preference_value:default_race_scope'; end if;
      update public.profiles set default_race_scope = s where id = uid;

    elsif k in ('quiet_hours_start','quiet_hours_end') then
      if jsonb_typeof(v) = 'null' then
        execute format('update public.profiles set %I = null where id = $1', k) using uid;
      else
        if jsonb_typeof(v) <> 'string' then raise exception 'invalid_preference_value:%', k; end if;
        s := v #>> '{}';
        if s !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'invalid_preference_value:%', k; end if;
        execute format('update public.profiles set %I = $1 where id = $2', k) using s, uid;
      end if;

    elsif k = 'timezone' then
      if jsonb_typeof(v) = 'null' then
        update public.profiles set timezone = null where id = uid;
      else
        if jsonb_typeof(v) <> 'string' then raise exception 'invalid_preference_value:timezone'; end if;
        s := v #>> '{}';
        if length(s) = 0 or length(s) > allowed_tz_len then raise exception 'invalid_preference_value:timezone'; end if;
        update public.profiles set timezone = s where id = uid;
      end if;

    elsif k = 'default_battle_stake' then
      if jsonb_typeof(v) <> 'number' then raise exception 'invalid_preference_value:default_battle_stake'; end if;
      n := (v::text)::numeric;
      if n < 0 or n > 100000 or n <> floor(n) then raise exception 'invalid_preference_value:default_battle_stake'; end if;
      update public.profiles set default_battle_stake = n::int where id = uid;

    else
      raise exception 'unknown_preference_key:%', k;
    end if;
  end loop;
end;
$$;

revoke all on function public.update_my_preferences(jsonb) from public;
revoke all on function public.update_my_preferences(jsonb) from anon;
grant execute on function public.update_my_preferences(jsonb) to authenticated;