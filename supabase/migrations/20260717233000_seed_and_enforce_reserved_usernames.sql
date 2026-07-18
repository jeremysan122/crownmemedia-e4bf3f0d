-- The reserved-usernames schema/RPC existed without seed rows, which made
-- sensitive handles appear available to anonymous callers. Seed the canonical
-- application denylist and enforce it at the profiles table so direct REST
-- writes cannot bypass the signup UI or availability RPC.

with raw_names(name) as (
  select unnest(array[
    -- Brand, staff, safety, and account-recovery impersonation targets.
    'admin', 'administrator', 'root', 'owner', 'staff', 'team', 'support',
    'help', 'crownme', 'crown', 'official', 'system', 'moderator', 'mod',
    'security', 'billing', 'legal', 'abuse', 'report', 'accountrecovery',
    'anonymous', 'null', 'undefined', 'ceo', 'founder', 'king', 'queen',
    'royalty',

    -- Application routes (normalized before insertion, so punctuation variants
    -- such as acceptable-use and acceptable_use resolve to one protected key).
    'account', 'acceptable-use', 'appeals', 'archived', 'auth', 'battles',
    'blocked', 'c', 'compliance', 'conduct', 'contact', 'contact-legal',
    'cookies', 'creator', 'csae-policy', 'discover', 'dmca', 'drafts',
    'edit-profile', 'eula', 'feed', 'insights', 'invite', 'leaderboard',
    'leaderboards', 'login', 'logout', 'map', 'me', 'messages', 'muted-words',
    'notifications', 'onboarding', 'p', 'pending', 'post', 'preferences',
    'privacy', 'profile', 'register', 'reports', 'reset-password', 'restricted',
    'rewards', 'royal-pass', 'scrolls', 'search', 'sensitive-content',
    'settings', 'shorts', 'signup', 'store', 'subscription-terms', 'terms',
    'u', 'unsubscribe', 'upload', 'verification', 'verify-age',
    'virtual-goods', 'wallet',

    -- Asset and SEO endpoints.
    'api', 'robots.txt', 'sitemap.xml', 'favicon.ico', 'manifest.json',
    'site.webmanifest', 'sw.js', 'placeholder.svg', 'llms.txt', 'og-image.png',
    'robots', 'sitemap'
  ]::text[])
), normalized_names as (
  select distinct public.normalize_username(name) as username
  from raw_names
  where public.normalize_username(name) is not null
    and length(public.normalize_username(name)) between 2 and 30
)
insert into public.reserved_usernames (
  username,
  category,
  reserved_reason,
  reservation_policy,
  source_label,
  priority,
  is_active,
  requires_identity_verification
)
select
  username,
  'system'::text,
  'Reserved to prevent route collisions, staff impersonation, or account-recovery abuse.'::text,
  'blocked'::text,
  'CrownMe canonical denylist'::text,
  100,
  true,
  false
from normalized_names
on conflict (username) do update set
  category = excluded.category,
  reserved_reason = excluded.reserved_reason,
  reservation_policy = excluded.reservation_policy,
  source_label = excluded.source_label,
  priority = excluded.priority,
  is_active = true,
  updated_at = now();

create or replace function public.enforce_profile_username_reservation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_normalized text;
  v_reservation public.reserved_usernames%rowtype;
begin
  v_normalized := public.normalize_username(new.username);

  select * into v_reservation
  from public.reserved_usernames
  where username = v_normalized
    and is_active = true;

  if found
     and v_reservation.claimed_by is distinct from new.id
     and not coalesce(public.has_role(auth.uid(), 'admin'::public.app_role), false)
  then
    raise exception 'That username is unavailable.' using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_profile_username_reservation() from public;

drop trigger if exists enforce_profile_username_reservation on public.profiles;
create trigger enforce_profile_username_reservation
before insert or update of username on public.profiles
for each row execute function public.enforce_profile_username_reservation();
