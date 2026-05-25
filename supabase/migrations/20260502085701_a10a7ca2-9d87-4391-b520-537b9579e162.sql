
-- 1. Drop unsafe purchase_shekels RPC (allowed any authed user to mint Shekels)
DROP FUNCTION IF EXISTS public.purchase_shekels(numeric);

-- 2. Add server-side 18+ age check inside handle_new_user trigger
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
  v_full_name := nullif(trim(coalesce(
    v_meta->>'full_name',
    v_meta->>'name',
    nullif(trim(coalesce(v_meta->>'given_name','') || ' ' || coalesce(v_meta->>'family_name','')), '')
  )), '');

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

  -- Server-side 18+ enforcement for email signups (OAuth users default to 2000-01-01 and must verify later)
  if v_provider = 'email' and v_dob > (CURRENT_DATE - INTERVAL '18 years') then
    raise exception 'User must be 18 or older to register';
  end if;

  v_city := v_meta->>'city';
  v_state := v_meta->>'state';
  v_country := v_meta->>'country';
  v_photo := coalesce(v_meta->>'profile_photo_url', v_meta->>'avatar_url', v_meta->>'picture');

  insert into public.profiles
    (id, username, city, state, country, profile_photo_url, bio)
  values
    (new.id, v_username, v_city, v_state, v_country, v_photo,
     case when v_full_name is not null then v_full_name else '' end)
  on conflict (id) do nothing;

  insert into public.profiles_private (id, email, dob, age_confirmed)
  values (new.id, v_email, v_dob,
          case when v_provider = 'email' then true else false end)
  on conflict (id) do nothing;

  insert into public.user_roles (user_id, role)
  values (new.id, 'user')
  on conflict do nothing;

  return new;
end $function$;

-- 3. Tighten gift_transactions: remove public-read policy
DROP POLICY IF EXISTS "Public can read non-sensitive gift columns" ON public.gift_transactions;

-- 4. Storage: enforce path ownership on uploads to avatars/posts/share-cards
DROP POLICY IF EXISTS "Authed upload avatars" ON storage.objects;
DROP POLICY IF EXISTS "Authed upload posts" ON storage.objects;
DROP POLICY IF EXISTS "Authed upload share-cards" ON storage.objects;

CREATE POLICY "Owner upload avatars"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Owner upload posts"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'posts'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Owner upload share-cards"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'share-cards'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- 5. Add owner DELETE/UPDATE policies for share-cards bucket
CREATE POLICY "Owner delete share-cards"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'share-cards'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Owner update share-cards"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'share-cards'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- 6. Restrictive policy on user_roles to ensure non-admins can never write
CREATE POLICY "Only admins can write roles (restrictive)"
  ON public.user_roles
  AS RESTRICTIVE
  FOR ALL
  TO authenticated, anon
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 7. Strict realtime dm-typing topic check (split on ':' delimiter rather than substring match)
DROP POLICY IF EXISTS "Users send to own topic only" ON realtime.messages;
DROP POLICY IF EXISTS "Users subscribe to own topic only" ON realtime.messages;

CREATE POLICY "Users send to own topic only"
  ON realtime.messages FOR INSERT TO authenticated
  WITH CHECK (
    (extension = ANY (ARRAY['broadcast'::text, 'presence'::text]))
    AND (
      realtime.topic() = auth.uid()::text
      OR (
        realtime.topic() LIKE 'dm-typing:%'
        AND auth.uid()::text = ANY (string_to_array(split_part(realtime.topic(), ':', 2), '__'))
      )
    )
  );

CREATE POLICY "Users subscribe to own topic only"
  ON realtime.messages FOR SELECT TO authenticated
  USING (
    (
      extension = 'postgres_changes'::text
      AND realtime.topic() = auth.uid()::text
    )
    OR (
      (extension = ANY (ARRAY['broadcast'::text, 'presence'::text]))
      AND (
        realtime.topic() = auth.uid()::text
        OR (
          realtime.topic() LIKE 'dm-typing:%'
          AND auth.uid()::text = ANY (string_to_array(split_part(realtime.topic(), ':', 2), '__'))
        )
      )
    )
  );
