-- =========================================================
-- Crown Me — Full schema
-- =========================================================

-- ENUMS
create type public.app_role as enum ('user', 'moderator', 'admin');
create type public.crown_category as enum ('overall', 'best_style', 'most_creative', 'most_popular', 'best_look', 'best_outfit');
create type public.vote_type as enum ('crown', 'fire', 'diamond');
create type public.region_type as enum ('city', 'state', 'country', 'global');
create type public.battle_status as enum ('pending', 'active', 'completed', 'declined', 'cancelled');
create type public.boost_type as enum ('royal_boost', 'vote_boost', 'crown_spotlight', 'profile_glow', 'crown_shield');
create type public.notification_type as enum ('vote', 'comment', 'follow', 'crown_won', 'crown_lost', 'battle_challenge', 'battle_won', 'battle_lost', 'dm', 'system');
create type public.report_status as enum ('open', 'resolved', 'dismissed');

-- =========================================================
-- PROFILES
-- =========================================================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  email text,
  dob date not null,
  age_confirmed boolean not null default false,
  profile_photo_url text,
  bio text default '',
  city text,
  state text,
  country text,
  followers_count integer not null default 0,
  following_count integer not null default 0,
  votes_received integer not null default 0,
  votes_given integer not null default 0,
  crowns_held integer not null default 0,
  crowns_total integer not null default 0,
  battle_wins integer not null default 0,
  is_suspended boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Profiles are viewable by everyone" on public.profiles for select using (true);
create policy "Users can update their own profile" on public.profiles for update using (auth.uid() = id);
create policy "Users can insert their own profile" on public.profiles for insert with check (auth.uid() = id);

-- =========================================================
-- USER ROLES
-- =========================================================
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  )
$$;

create policy "Users can view their own roles" on public.user_roles for select using (auth.uid() = user_id or public.has_role(auth.uid(), 'admin'));
create policy "Admins manage roles" on public.user_roles for all using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

-- =========================================================
-- POSTS
-- =========================================================
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  image_url text not null,
  caption text default '',
  category public.crown_category not null default 'overall',
  city text,
  state text,
  country text,
  crown_score numeric not null default 0,
  vote_count integer not null default 0,
  comment_count integer not null default 0,
  share_count integer not null default 0,
  battle_wins integer not null default 0,
  is_removed boolean not null default false,
  created_at timestamptz not null default now()
);

create index posts_user_id_idx on public.posts(user_id);
create index posts_city_idx on public.posts(city);
create index posts_state_idx on public.posts(state);
create index posts_country_idx on public.posts(country);
create index posts_category_idx on public.posts(category);
create index posts_crown_score_idx on public.posts(crown_score desc);

alter table public.posts enable row level security;
create policy "Posts are viewable by everyone" on public.posts for select using (is_removed = false or auth.uid() = user_id or public.has_role(auth.uid(), 'moderator') or public.has_role(auth.uid(), 'admin'));
create policy "Users can insert their own posts" on public.posts for insert with check (auth.uid() = user_id);
create policy "Users can update their own posts" on public.posts for update using (auth.uid() = user_id or public.has_role(auth.uid(), 'moderator') or public.has_role(auth.uid(), 'admin'));
create policy "Users/mods can delete posts" on public.posts for delete using (auth.uid() = user_id or public.has_role(auth.uid(), 'moderator') or public.has_role(auth.uid(), 'admin'));

-- =========================================================
-- VOTES
-- =========================================================
create table public.votes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  vote_type public.vote_type not null,
  created_at timestamptz not null default now(),
  unique (user_id, post_id, vote_type)
);

create index votes_post_id_idx on public.votes(post_id);
create index votes_user_id_idx on public.votes(user_id);

alter table public.votes enable row level security;
create policy "Votes are viewable by everyone" on public.votes for select using (true);
create policy "Users can vote as themselves" on public.votes for insert with check (auth.uid() = user_id);
create policy "Users can remove their own vote" on public.votes for delete using (auth.uid() = user_id);

-- =========================================================
-- COMMENTS
-- =========================================================
create table public.comments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  body text not null,
  is_removed boolean not null default false,
  created_at timestamptz not null default now()
);

create index comments_post_id_idx on public.comments(post_id);

alter table public.comments enable row level security;
create policy "Comments viewable by everyone" on public.comments for select using (is_removed = false or auth.uid() = user_id or public.has_role(auth.uid(), 'moderator'));
create policy "Users can comment as themselves" on public.comments for insert with check (auth.uid() = user_id);
create policy "Users can update own comments" on public.comments for update using (auth.uid() = user_id or public.has_role(auth.uid(), 'moderator'));
create policy "Users can delete own comments" on public.comments for delete using (auth.uid() = user_id or public.has_role(auth.uid(), 'moderator'));

-- =========================================================
-- FOLLOWS
-- =========================================================
create table public.follows (
  id uuid primary key default gen_random_uuid(),
  follower_id uuid not null references public.profiles(id) on delete cascade,
  following_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (follower_id, following_id),
  check (follower_id <> following_id)
);

create index follows_follower_idx on public.follows(follower_id);
create index follows_following_idx on public.follows(following_id);

alter table public.follows enable row level security;
create policy "Follows viewable by everyone" on public.follows for select using (true);
create policy "Users can follow as themselves" on public.follows for insert with check (auth.uid() = follower_id);
create policy "Users can unfollow themselves" on public.follows for delete using (auth.uid() = follower_id);

-- =========================================================
-- BLOCKS
-- =========================================================
create table public.blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (blocker_id, blocked_id)
);

alter table public.blocks enable row level security;
create policy "Users see their own blocks" on public.blocks for select using (auth.uid() = blocker_id);
create policy "Users can block as themselves" on public.blocks for insert with check (auth.uid() = blocker_id);
create policy "Users can unblock themselves" on public.blocks for delete using (auth.uid() = blocker_id);

-- =========================================================
-- MESSAGES
-- =========================================================
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  receiver_id uuid not null references public.profiles(id) on delete cascade,
  body text default '',
  shared_post_id uuid references public.posts(id) on delete set null,
  shared_profile_id uuid references public.profiles(id) on delete set null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index messages_pair_idx on public.messages(sender_id, receiver_id, created_at);
create index messages_receiver_idx on public.messages(receiver_id);

alter table public.messages enable row level security;
create policy "Users see their own DMs" on public.messages for select using (auth.uid() = sender_id or auth.uid() = receiver_id);
create policy "Users send DMs as themselves" on public.messages for insert with check (auth.uid() = sender_id);
create policy "Recipient can mark read" on public.messages for update using (auth.uid() = receiver_id);

-- =========================================================
-- CROWNS
-- =========================================================
create table public.crowns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid references public.posts(id) on delete set null,
  region_type public.region_type not null,
  region_name text not null,
  category public.crown_category not null,
  title text not null,
  crown_score numeric not null default 0,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index crowns_active_idx on public.crowns(region_type, region_name, category, active);
create index crowns_user_idx on public.crowns(user_id);

alter table public.crowns enable row level security;
create policy "Crowns viewable by everyone" on public.crowns for select using (true);
create policy "Service can manage crowns" on public.crowns for all using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

-- =========================================================
-- BATTLES
-- =========================================================
create table public.battles (
  id uuid primary key default gen_random_uuid(),
  challenger_id uuid not null references public.profiles(id) on delete cascade,
  opponent_id uuid not null references public.profiles(id) on delete cascade,
  challenger_post_id uuid not null references public.posts(id) on delete cascade,
  opponent_post_id uuid references public.posts(id) on delete cascade,
  challenger_votes integer not null default 0,
  opponent_votes integer not null default 0,
  winner_id uuid references public.profiles(id) on delete set null,
  status public.battle_status not null default 'pending',
  ends_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.battles enable row level security;
create policy "Battles viewable by everyone" on public.battles for select using (true);
create policy "Users create battles as challenger" on public.battles for insert with check (auth.uid() = challenger_id);
create policy "Participants can update battle" on public.battles for update using (auth.uid() = challenger_id or auth.uid() = opponent_id);

create table public.battle_votes (
  id uuid primary key default gen_random_uuid(),
  battle_id uuid not null references public.battles(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  voted_for_user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (battle_id, user_id)
);

alter table public.battle_votes enable row level security;
create policy "Battle votes viewable by everyone" on public.battle_votes for select using (true);
create policy "Users vote in battles as themselves" on public.battle_votes for insert with check (auth.uid() = user_id);

-- =========================================================
-- REPORTS
-- =========================================================
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reported_user_id uuid references public.profiles(id) on delete cascade,
  post_id uuid references public.posts(id) on delete cascade,
  comment_id uuid references public.comments(id) on delete cascade,
  reason text not null,
  status public.report_status not null default 'open',
  created_at timestamptz not null default now()
);

alter table public.reports enable row level security;
create policy "Reporter sees own reports" on public.reports for select using (auth.uid() = reporter_id or public.has_role(auth.uid(), 'moderator') or public.has_role(auth.uid(), 'admin'));
create policy "Users report as themselves" on public.reports for insert with check (auth.uid() = reporter_id);
create policy "Mods update reports" on public.reports for update using (public.has_role(auth.uid(), 'moderator') or public.has_role(auth.uid(), 'admin'));

-- =========================================================
-- BOOSTS
-- =========================================================
create table public.boosts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid references public.posts(id) on delete cascade,
  boost_type public.boost_type not null,
  active boolean not null default true,
  started_at timestamptz not null default now(),
  expires_at timestamptz
);

alter table public.boosts enable row level security;
create policy "Boosts viewable by everyone" on public.boosts for select using (true);
create policy "Users buy boosts as themselves" on public.boosts for insert with check (auth.uid() = user_id);
create policy "Users update own boosts" on public.boosts for update using (auth.uid() = user_id);

-- =========================================================
-- NOTIFICATIONS
-- =========================================================
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type public.notification_type not null,
  title text not null,
  body text default '',
  payload jsonb default '{}'::jsonb,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index notifications_user_idx on public.notifications(user_id, created_at desc);

alter table public.notifications enable row level security;
create policy "Users see own notifications" on public.notifications for select using (auth.uid() = user_id);
create policy "System inserts notifications" on public.notifications for insert with check (true);
create policy "Users mark own read" on public.notifications for update using (auth.uid() = user_id);

-- =========================================================
-- TRIGGER: profile + default role on signup
-- =========================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_username text;
  v_dob date;
  v_city text;
  v_state text;
  v_country text;
  v_photo text;
begin
  v_username := coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1));
  v_dob := coalesce((new.raw_user_meta_data->>'dob')::date, '2000-01-01'::date);
  v_city := new.raw_user_meta_data->>'city';
  v_state := new.raw_user_meta_data->>'state';
  v_country := new.raw_user_meta_data->>'country';
  v_photo := new.raw_user_meta_data->>'profile_photo_url';

  insert into public.profiles (id, email, username, dob, age_confirmed, city, state, country, profile_photo_url)
  values (new.id, new.email, v_username, v_dob, true, v_city, v_state, v_country, v_photo)
  on conflict (id) do nothing;

  insert into public.user_roles (user_id, role)
  values (new.id, 'user')
  on conflict do nothing;

  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- =========================================================
-- CROWN SCORE recalculation
-- =========================================================
create or replace function public.recalc_post_score(_post_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_crown int;
  v_fire int;
  v_diamond int;
  v_comments int;
  v_shares int;
  v_battle int;
  v_base numeric;
  v_score numeric;
  v_boost numeric := 1.0;
begin
  select count(*) filter (where vote_type='crown'),
         count(*) filter (where vote_type='fire'),
         count(*) filter (where vote_type='diamond')
    into v_crown, v_fire, v_diamond
  from public.votes where post_id = _post_id;

  select count(*) into v_comments from public.comments where post_id = _post_id and is_removed = false;
  select coalesce(share_count,0), coalesce(battle_wins,0) into v_shares, v_battle from public.posts where id = _post_id;

  if exists (select 1 from public.boosts where post_id = _post_id and boost_type = 'royal_boost' and active and (expires_at is null or expires_at > now())) then
    v_boost := 1.5;
  end if;

  v_base := v_crown + (v_fire * 0.5) + (v_diamond * 1.5);
  v_score := (v_base + (v_base * (v_comments * 0.01)) + (v_shares * 0.25) + (v_battle * 5)) * v_boost;

  update public.posts
    set crown_score = v_score,
        vote_count = v_crown + v_fire + v_diamond,
        comment_count = v_comments
  where id = _post_id;
end $$;

create or replace function public.trg_recalc_from_votes()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.recalc_post_score(coalesce(new.post_id, old.post_id));
  -- update votes_received aggregate
  update public.profiles p
    set votes_received = (
      select count(*) from public.votes v join public.posts po on po.id = v.post_id where po.user_id = p.id
    )
    where p.id = (select user_id from public.posts where id = coalesce(new.post_id, old.post_id));
  -- votes_given for voter
  if tg_op = 'INSERT' then
    update public.profiles set votes_given = votes_given + 1 where id = new.user_id;
  elsif tg_op = 'DELETE' then
    update public.profiles set votes_given = greatest(votes_given - 1, 0) where id = old.user_id;
  end if;
  return null;
end $$;

create trigger votes_recalc after insert or delete on public.votes for each row execute function public.trg_recalc_from_votes();

create or replace function public.trg_recalc_from_comments()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.recalc_post_score(coalesce(new.post_id, old.post_id));
  return null;
end $$;
create trigger comments_recalc after insert or delete or update on public.comments for each row execute function public.trg_recalc_from_comments();

-- =========================================================
-- CROWN HOLDER refresh
-- =========================================================
create or replace function public.refresh_crowns_for_post(_post_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  p record;
  scopes text[][] := array[array['city'],array['state'],array['country'],array['global']];
  s text;
  region_val text;
  top_post record;
  cat public.crown_category;
  cats public.crown_category[] := array['overall','best_style','most_creative','most_popular','best_look','best_outfit'];
begin
  select * into p from public.posts where id = _post_id;
  if not found then return; end if;

  foreach s in array array['city','state','country','global'] loop
    if s = 'city' then region_val := p.city;
    elsif s = 'state' then region_val := p.state;
    elsif s = 'country' then region_val := p.country;
    else region_val := 'Global';
    end if;
    if region_val is null or region_val = '' then continue; end if;

    foreach cat in array cats loop
      -- find top post
      select po.id, po.user_id, po.crown_score into top_post
      from public.posts po
      where po.is_removed = false
        and po.category = cat
        and ( (s='city' and po.city = region_val)
           or (s='state' and po.state = region_val)
           or (s='country' and po.country = region_val)
           or (s='global'))
      order by po.crown_score desc, po.created_at asc
      limit 1;

      if top_post.id is null then continue; end if;

      -- Deactivate any active crown for this region/category not held by top user
      update public.crowns set active = false, ended_at = now()
      where region_type = s::public.region_type and region_name = region_val and category = cat
        and active = true and user_id <> top_post.user_id;

      -- If no active crown for this user/region/cat, create one
      if not exists (select 1 from public.crowns where region_type = s::public.region_type and region_name = region_val and category = cat and active = true and user_id = top_post.user_id) then
        insert into public.crowns (user_id, post_id, region_type, region_name, category, title, crown_score)
        values (
          top_post.user_id,
          top_post.id,
          s::public.region_type,
          region_val,
          cat,
          'Holder of ' || region_val || ' (' || cat::text || ')',
          top_post.crown_score
        );
      else
        update public.crowns set crown_score = top_post.crown_score, post_id = top_post.id
        where region_type = s::public.region_type and region_name = region_val and category = cat and active = true and user_id = top_post.user_id;
      end if;
    end loop;
  end loop;

  -- recompute crowns aggregates
  update public.profiles p2 set
    crowns_held = (select count(*) from public.crowns where user_id = p2.id and active),
    crowns_total = (select count(*) from public.crowns where user_id = p2.id);
end $$;

create or replace function public.trg_refresh_crowns()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.refresh_crowns_for_post(new.id);
  return null;
end $$;

create trigger posts_refresh_crowns after update of crown_score on public.posts for each row execute function public.trg_refresh_crowns();

-- =========================================================
-- FOLLOWER COUNT triggers
-- =========================================================
create or replace function public.trg_follow_counts()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.profiles set followers_count = followers_count + 1 where id = new.following_id;
    update public.profiles set following_count = following_count + 1 where id = new.follower_id;
    insert into public.notifications (user_id, type, title, body, payload)
      values (new.following_id, 'follow', 'New follower', 'Someone just followed you', jsonb_build_object('follower_id', new.follower_id));
  elsif tg_op = 'DELETE' then
    update public.profiles set followers_count = greatest(followers_count - 1, 0) where id = old.following_id;
    update public.profiles set following_count = greatest(following_count - 1, 0) where id = old.follower_id;
  end if;
  return null;
end $$;

create trigger follows_counts after insert or delete on public.follows for each row execute function public.trg_follow_counts();

-- =========================================================
-- NOTIFICATION triggers (vote, comment, dm)
-- =========================================================
create or replace function public.trg_notify_vote()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_owner uuid;
begin
  if tg_op = 'INSERT' then
    select user_id into v_owner from public.posts where id = new.post_id;
    if v_owner is not null and v_owner <> new.user_id then
      insert into public.notifications (user_id, type, title, body, payload)
      values (v_owner, 'vote', 'New ' || new.vote_type::text || ' vote', 'Someone voted on your post', jsonb_build_object('post_id', new.post_id, 'voter_id', new.user_id, 'vote_type', new.vote_type));
    end if;
  end if;
  return null;
end $$;
create trigger votes_notify after insert on public.votes for each row execute function public.trg_notify_vote();

create or replace function public.trg_notify_comment()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_owner uuid;
begin
  if tg_op = 'INSERT' then
    select user_id into v_owner from public.posts where id = new.post_id;
    if v_owner is not null and v_owner <> new.user_id then
      insert into public.notifications (user_id, type, title, body, payload)
      values (v_owner, 'comment', 'New comment', left(new.body, 80), jsonb_build_object('post_id', new.post_id, 'comment_id', new.id, 'author_id', new.user_id));
    end if;
  end if;
  return null;
end $$;
create trigger comments_notify after insert on public.comments for each row execute function public.trg_notify_comment();

create or replace function public.trg_notify_dm()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (user_id, type, title, body, payload)
  values (new.receiver_id, 'dm', 'New message', left(coalesce(new.body, 'Shared content'), 80), jsonb_build_object('sender_id', new.sender_id, 'message_id', new.id));
  return null;
end $$;
create trigger messages_notify after insert on public.messages for each row execute function public.trg_notify_dm();

-- =========================================================
-- BATTLE notification + finalize
-- =========================================================
create or replace function public.trg_notify_battle_create()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (user_id, type, title, body, payload)
  values (new.opponent_id, 'battle_challenge', 'Crown Battle Challenge', 'You have been challenged to a Crown Battle', jsonb_build_object('battle_id', new.id, 'challenger_id', new.challenger_id));
  return null;
end $$;
create trigger battles_notify after insert on public.battles for each row execute function public.trg_notify_battle_create();

create or replace function public.trg_battle_vote()
returns trigger language plpgsql security definer set search_path = public as $$
declare b record;
begin
  select * into b from public.battles where id = new.battle_id;
  update public.battles set
    challenger_votes = (select count(*) from public.battle_votes where battle_id = new.battle_id and voted_for_user_id = b.challenger_id),
    opponent_votes = (select count(*) from public.battle_votes where battle_id = new.battle_id and voted_for_user_id = b.opponent_id)
  where id = new.battle_id;
  return null;
end $$;
create trigger battle_votes_count after insert on public.battle_votes for each row execute function public.trg_battle_vote();

-- =========================================================
-- STORAGE
-- =========================================================
insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true) on conflict do nothing;
insert into storage.buckets (id, name, public) values ('posts', 'posts', true) on conflict do nothing;
insert into storage.buckets (id, name, public) values ('share-cards', 'share-cards', true) on conflict do nothing;

create policy "Public read avatars" on storage.objects for select using (bucket_id = 'avatars');
create policy "Authed upload avatars" on storage.objects for insert with check (bucket_id = 'avatars' and auth.role() = 'authenticated');
create policy "Owner update avatars" on storage.objects for update using (bucket_id = 'avatars' and owner = auth.uid());
create policy "Owner delete avatars" on storage.objects for delete using (bucket_id = 'avatars' and owner = auth.uid());

create policy "Public read posts" on storage.objects for select using (bucket_id = 'posts');
create policy "Authed upload posts" on storage.objects for insert with check (bucket_id = 'posts' and auth.role() = 'authenticated');
create policy "Owner update posts" on storage.objects for update using (bucket_id = 'posts' and owner = auth.uid());
create policy "Owner delete posts" on storage.objects for delete using (bucket_id = 'posts' and owner = auth.uid());

create policy "Public read share-cards" on storage.objects for select using (bucket_id = 'share-cards');
create policy "Authed upload share-cards" on storage.objects for insert with check (bucket_id = 'share-cards' and auth.role() = 'authenticated');

-- Realtime
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.notifications;
alter publication supabase_realtime add table public.votes;
alter publication supabase_realtime add table public.battle_votes;
alter publication supabase_realtime add table public.battles;