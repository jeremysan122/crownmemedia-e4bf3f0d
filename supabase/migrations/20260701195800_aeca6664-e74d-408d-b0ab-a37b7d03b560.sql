
create or replace function public.get_my_admin_roles()
returns table(role text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return;
  end if;
  return query
    select ur.role::text
    from public.user_roles ur
    where ur.user_id = auth.uid();
end;
$$;

revoke all on function public.get_my_admin_roles() from public;
revoke all on function public.get_my_admin_roles() from anon;
grant execute on function public.get_my_admin_roles() to authenticated;

create or replace function public.update_my_preferences(_prefs jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  allowed_keys constant text[] := array[
    'is_private',
    'hide_vote_activity',
    'hide_online_status',
    'dm_from',
    'mentions_from',
    'comments_from',
    'show_read_receipts',
    'allow_reposts',
    'allow_gifts',
    'appear_in_leaderboards',
    'appear_in_map',
    'appear_in_search'
  ];
  k text;
  updates jsonb := '{}'::jsonb;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;
  if _prefs is null or jsonb_typeof(_prefs) <> 'object' then
    raise exception 'invalid_payload';
  end if;

  for k in select jsonb_object_keys(_prefs) loop
    if not (k = any(allowed_keys)) then
      raise exception 'unknown_preference_key';
    end if;
    if k in ('dm_from', 'mentions_from', 'comments_from') then
      if jsonb_typeof(_prefs -> k) <> 'string'
         or (_prefs ->> k) not in ('everyone', 'followers', 'nobody') then
        raise exception 'invalid_preference_value';
      end if;
    else
      if jsonb_typeof(_prefs -> k) <> 'boolean' then
        raise exception 'invalid_preference_value';
      end if;
    end if;
    updates := updates || jsonb_build_object(k, _prefs -> k);
  end loop;

  if updates = '{}'::jsonb then
    return;
  end if;

  update public.profiles p
  set
    is_private         = coalesce((updates->>'is_private')::boolean,         p.is_private),
    hide_vote_activity = coalesce((updates->>'hide_vote_activity')::boolean, p.hide_vote_activity)
  where p.id = uid;
end;
$$;

revoke all on function public.update_my_preferences(jsonb) from public;
revoke all on function public.update_my_preferences(jsonb) from anon;
grant execute on function public.update_my_preferences(jsonb) to authenticated;
