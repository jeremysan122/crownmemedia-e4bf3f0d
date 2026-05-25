CREATE OR REPLACE FUNCTION public.refresh_crowns_for_post(_post_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  p record;
  s text;
  region_val text;
  top_post record;
  cat public.crown_category;
  cats public.crown_category[];
begin
  select * into p from public.posts where id = _post_id;
  if not found then return; end if;

  -- Build cats array dynamically from all enum values so new categories are auto-supported
  select array_agg(enumlabel::public.crown_category order by enumsortorder)
    into cats
    from pg_enum
    where enumtypid = 'public.crown_category'::regtype;

  foreach s in array array['city','state','country','global'] loop
    if s = 'city' then region_val := p.city;
    elsif s = 'state' then region_val := p.state;
    elsif s = 'country' then region_val := p.country;
    else region_val := 'Global';
    end if;
    if region_val is null or region_val = '' then continue; end if;

    foreach cat in array cats loop
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

      update public.crowns set active = false, ended_at = now()
      where region_type = s::public.region_type and region_name = region_val and category = cat
        and active = true and user_id <> top_post.user_id;

      if not exists (select 1 from public.crowns where region_type = s::public.region_type and region_name = region_val and category = cat and active = true and user_id = top_post.user_id) then
        insert into public.crowns (user_id, post_id, region_type, region_name, category, title, crown_score)
        values (
          top_post.user_id, top_post.id, s::public.region_type, region_val, cat,
          'Holder of ' || region_val || ' (' || cat::text || ')', top_post.crown_score
        );
      else
        update public.crowns set crown_score = top_post.crown_score, post_id = top_post.id
        where region_type = s::public.region_type and region_name = region_val and category = cat and active = true and user_id = top_post.user_id;
      end if;
    end loop;
  end loop;

  update public.profiles p2 set
    crowns_held = (select count(*) from public.crowns where user_id = p2.id and active),
    crowns_total = (select count(*) from public.crowns where user_id = p2.id);
end $function$;