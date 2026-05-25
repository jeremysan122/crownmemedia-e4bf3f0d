CREATE OR REPLACE FUNCTION public.trg_notify_comment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_owner uuid;
begin
  if tg_op = 'INSERT' then
    select user_id into v_owner from public.posts where id = new.post_id;
    if v_owner is null or v_owner = new.user_id then
      return null;
    end if;
    -- Skip when the owner is being @mentioned in the same comment — the
    -- mention trigger will deliver a more specific notification, preventing
    -- a "doubled" entry in Royal Decrees for the exact same event.
    if new.mention_user_ids is not null and v_owner = ANY(new.mention_user_ids) then
      return null;
    end if;
    insert into public.notifications (user_id, type, title, body, payload)
    values (v_owner, 'comment', 'New comment', left(new.body, 80),
            jsonb_build_object('post_id', new.post_id, 'comment_id', new.id, 'author_id', new.user_id));
  end if;
  return null;
end $function$;