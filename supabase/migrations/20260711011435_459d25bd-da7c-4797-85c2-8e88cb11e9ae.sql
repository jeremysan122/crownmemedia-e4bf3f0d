
create or replace function public.get_live_battle_comments(
  _battle_id uuid,
  _before timestamptz default null,
  _limit int default 30
)
returns table (
  id uuid,
  battle_id uuid,
  user_id uuid,
  body text,
  created_at timestamptz,
  hidden_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  select c.id, c.battle_id, c.user_id, c.body, c.created_at, c.hidden_at
  from public.live_battle_comments c
  where c.battle_id = _battle_id
    and (_before is null or c.created_at < _before)
    and (
      auth.uid() is null
      or not exists (
        select 1 from public.blocks b
        where b.blocker_id = auth.uid()
          and b.blocked_id = c.user_id
      )
      or has_role(auth.uid(), 'moderator'::app_role)
      or has_role(auth.uid(), 'admin'::app_role)
    )
  order by c.created_at desc
  limit least(coalesce(_limit, 30), 100);
$$;

grant execute on function public.get_live_battle_comments(uuid, timestamptz, int) to authenticated, anon;
