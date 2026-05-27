
-- 1) Random shared secret for trigger -> edge function
do $$
declare v text := encode(gen_random_bytes(32), 'hex');
begin
  if not exists (select 1 from vault.secrets where name = 'web_push_trigger_secret') then
    perform vault.create_secret(v, 'web_push_trigger_secret');
  end if;
end $$;

-- 2) Verifier used by the edge function (called with service role)
create or replace function public.verify_web_push_trigger_secret(_secret text)
returns boolean
language sql
security definer
set search_path = public, vault, pg_catalog
as $$
  select exists (
    select 1 from vault.decrypted_secrets
    where name = 'web_push_trigger_secret' and decrypted_secret = _secret
  )
$$;
revoke all on function public.verify_web_push_trigger_secret(text) from public;
grant execute on function public.verify_web_push_trigger_secret(text) to service_role;

-- 3) Trigger that fans out push events
create or replace function public.send_push_on_notification()
returns trigger
language plpgsql
security definer
set search_path = public, vault, pg_catalog
as $$
declare
  v_secret text;
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
  from vault.decrypted_secrets
  where name = 'web_push_trigger_secret'
  limit 1;

  if v_secret is null then
    return NEW;
  end if;

  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-trigger-secret', v_secret
    ),
    body := jsonb_build_object('notification_id', NEW.id)
  );

  return NEW;
exception when others then
  -- Never block the insert because of push delivery
  return NEW;
end $$;

drop trigger if exists trg_send_push_on_notification on public.notifications;
create trigger trg_send_push_on_notification
after insert on public.notifications
for each row
execute function public.send_push_on_notification();
