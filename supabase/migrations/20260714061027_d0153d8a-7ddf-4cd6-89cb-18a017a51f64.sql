
-- 1. Reservation table
create table if not exists public.reserved_usernames (
  username text primary key,
  category text not null,
  reserved_reason text not null,
  reservation_policy text not null check (reservation_policy in ('blocked','claimable','protected_identity')),
  source_label text not null,
  priority integer not null default 50 check (priority between 0 and 100),
  is_active boolean not null default true,
  requires_identity_verification boolean not null default false,
  claimed_by uuid null references auth.users(id) on delete set null,
  claimed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reserved_username_format check (username = lower(username) and username ~ '^[a-z0-9]{2,30}$')
);

create index if not exists reserved_usernames_category_idx
  on public.reserved_usernames(category) where is_active;
create index if not exists reserved_usernames_policy_idx
  on public.reserved_usernames(reservation_policy) where is_active;
create index if not exists reserved_usernames_claimed_by_idx
  on public.reserved_usernames(claimed_by) where claimed_by is not null;

alter table public.reserved_usernames enable row level security;
revoke all on public.reserved_usernames from anon, authenticated;
grant all on public.reserved_usernames to service_role;

drop policy if exists "reserved_usernames_admin_read" on public.reserved_usernames;
create policy "reserved_usernames_admin_read"
  on public.reserved_usernames for select to authenticated
  using (public.has_role(auth.uid(), 'admin'::app_role));

-- 2. Audit log
create table if not exists public.reserved_username_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid null references auth.users(id) on delete set null,
  action text not null,
  username text not null,
  previous_record jsonb null,
  new_record jsonb null,
  target_user_id uuid null references auth.users(id) on delete set null,
  evidence_notes text null,
  request_ip text null,
  user_agent text null,
  created_at timestamptz not null default now()
);

grant select on public.reserved_username_audit_log to authenticated;
grant all on public.reserved_username_audit_log to service_role;

alter table public.reserved_username_audit_log enable row level security;

drop policy if exists "reserved_username_audit_admin_read" on public.reserved_username_audit_log;
create policy "reserved_username_audit_admin_read"
  on public.reserved_username_audit_log for select to authenticated
  using (public.has_role(auth.uid(), 'admin'::app_role));

create index if not exists reserved_username_audit_log_username_idx
  on public.reserved_username_audit_log(username);
create index if not exists reserved_username_audit_log_created_idx
  on public.reserved_username_audit_log(created_at desc);

-- 3. Normalizer
create or replace function public.normalize_username(_username text)
returns text
language sql
immutable
strict
set search_path = public
as $$
  select left(lower(regexp_replace(regexp_replace(trim(_username), '^@', ''), '[^a-zA-Z0-9]', '', 'g')), 30);
$$;

-- 4. Reservation status (public-safe)
create or replace function public.username_reservation_status(_username text)
returns table (
  is_reserved boolean,
  reservation_policy text,
  category text,
  message text
)
language sql
security definer
set search_path = public
stable
as $$
  with candidate as (select public.normalize_username(_username) as username)
  select
    (r.username is not null) as is_reserved,
    r.reservation_policy,
    r.category,
    case
      when r.reservation_policy = 'blocked' then 'This username is unavailable.'
      when r.reservation_policy in ('claimable','protected_identity') then
        'This username is reserved. Contact CrownMe support to request verified ownership.'
      else null
    end as message
  from candidate c
  left join public.reserved_usernames r
    on r.username = c.username and r.is_active = true;
$$;

revoke all on function public.username_reservation_status(text) from public;
grant execute on function public.username_reservation_status(text) to anon, authenticated, service_role;

-- 5. Combined availability check
create or replace function public.check_username_available(_username text)
returns table (
  normalized text,
  available boolean,
  reason text,
  message text
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_norm text;
  v_reserved public.reserved_usernames%rowtype;
  v_taken boolean;
begin
  v_norm := public.normalize_username(_username);

  if v_norm is null or length(v_norm) < 2 or length(v_norm) > 30 then
    return query select v_norm, false, 'invalid'::text,
      'Usernames must be 2–30 characters (letters and numbers only).'::text;
    return;
  end if;

  select * into v_reserved
  from public.reserved_usernames
  where username = v_norm and is_active = true;

  if found then
    if v_reserved.reservation_policy = 'blocked' then
      return query select v_norm, false, 'reserved_blocked'::text,
        'This username is unavailable.'::text;
      return;
    else
      return query select v_norm, false, 'reserved_claimable'::text,
        'This username is reserved. Contact CrownMe support to request verified ownership.'::text;
      return;
    end if;
  end if;

  select exists(select 1 from public.profiles where lower(username) = v_norm) into v_taken;
  if v_taken then
    return query select v_norm, false, 'taken'::text, 'That username is already taken.'::text;
    return;
  end if;

  return query select v_norm, true, 'available'::text, null::text;
end;
$$;

revoke all on function public.check_username_available(text) from public;
grant execute on function public.check_username_available(text) to anon, authenticated, service_role;

-- 6. Admin claim RPC
create or replace function public.admin_claim_reserved_username(
  _username text,
  _target_user_id uuid,
  _evidence_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_norm text;
  v_reserved public.reserved_usernames%rowtype;
  v_prev jsonb;
  v_new jsonb;
  v_target_exists boolean;
  v_username_taken boolean;
begin
  if not public.has_role(auth.uid(), 'admin'::app_role) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  v_norm := public.normalize_username(_username);
  if v_norm is null or length(v_norm) < 2 or length(v_norm) > 30 then
    raise exception 'invalid_username';
  end if;

  select * into v_reserved from public.reserved_usernames where username = v_norm for update;
  if not found then raise exception 'reservation_not_found'; end if;
  if not v_reserved.is_active then raise exception 'reservation_inactive'; end if;
  if v_reserved.reservation_policy = 'blocked' then raise exception 'reservation_blocked'; end if;
  if v_reserved.claimed_by is not null then raise exception 'reservation_already_claimed'; end if;

  select exists(select 1 from auth.users where id = _target_user_id) into v_target_exists;
  if not v_target_exists then raise exception 'target_user_not_found'; end if;

  select exists(select 1 from public.profiles where lower(username) = v_norm and id <> _target_user_id) into v_username_taken;
  if v_username_taken then raise exception 'username_already_assigned'; end if;

  v_prev := to_jsonb(v_reserved);

  update public.profiles set username = v_norm, updated_at = now() where id = _target_user_id;

  update public.reserved_usernames
    set claimed_by = _target_user_id, claimed_at = now(), updated_at = now()
    where username = v_norm
    returning to_jsonb(public.reserved_usernames.*) into v_new;

  insert into public.reserved_username_audit_log(
    actor_user_id, action, username, previous_record, new_record, target_user_id, evidence_notes
  ) values (
    auth.uid(), 'admin_claim', v_norm, v_prev, v_new, _target_user_id, _evidence_notes
  );

  return jsonb_build_object('ok', true, 'username', v_norm, 'target_user_id', _target_user_id);
end;
$$;

revoke all on function public.admin_claim_reserved_username(text, uuid, text) from public;
grant execute on function public.admin_claim_reserved_username(text, uuid, text) to authenticated, service_role;
