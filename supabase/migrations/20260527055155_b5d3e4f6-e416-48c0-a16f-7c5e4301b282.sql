create or replace function public.send_push_on_notification()
returns trigger
language plpgsql
security definer
set search_path = public, vault, pg_catalog
as $$
declare
  v_secret text;
  v_anon   text;
  v_enabled boolean;
  v_url text := 'https://bailrqskqpmzvsgivhvm.supabase.co/functions/v1/send-web-push';
begin
  select push_enabled into v_enabled
  from public.notification_preferences
  where user_id = NEW.user_id;

  if coalesce(v_enabled, false) = false then
    return NEW;
  end if;

  select decrypted_secret into v_secret
  from vault.decrypted_secrets where name = 'web_push_trigger_secret' limit 1;
  if v_secret is null then return NEW; end if;

  select decrypted_secret into v_anon
  from vault.decrypted_secrets where name = 'web_push_anon_key' limit 1;

  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', coalesce(v_anon, ''),
      'Authorization', 'Bearer ' || coalesce(v_anon, ''),
      'x-trigger-secret', v_secret
    ),
    body := jsonb_build_object('notification_id', NEW.id)
  );

  return NEW;
exception when others then
  return NEW;
end $$;