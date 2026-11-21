-- Read line-event wake config from Supabase Vault, then the existing database settings.
-- Additive only: create or replace. No drop of data, no truncate, no delete, no cron.
-- Does not create Vault secrets and does not set any gate to on. Turn-on steps are in
-- docs/crm/line-event-wake.md.
--
-- Hosted Supabase does not let the postgres role run
-- ALTER DATABASE postgres SET line_event.*. That statement fails with 42501.
--
-- Norman falls back to line_event.wake_http, line_event.worker_url, line_event.worker_secret.
-- Onyx falls back to line_event.onyx_wake_http, line_event.onyx_worker_url, line_event.onyx_worker_secret.
-- Sundance falls back to line_event.sundance_wake_http, line_event.sundance_worker_url,
-- line_event.sundance_worker_secret.
-- Lotus is unchanged and stays wake_disabled. This migration does not add a Lotus branch.

create or replace function line_event.wake_setting(p_secret_name text, p_setting_name text)
returns text
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_secret text;
begin
  begin
    select ds.decrypted_secret
      into strict v_secret
    from vault.decrypted_secrets ds
    where ds.name = p_secret_name
    order by ds.updated_at desc nulls last, ds.created_at desc nulls last, ds.id desc
    limit 1;
    return v_secret;
  exception
    when no_data_found or undefined_table or invalid_schema_name then
      return current_setting(p_setting_name, true);
  end;
end
$fn$;

comment on function line_event.wake_setting(text, text) is
  'One wake value from vault.decrypted_secrets by name, including a null secret. Falls back to current_setting when that secret or the Vault view is absent. Callers are not granted execute.';

revoke all on function line_event.wake_setting(text, text) from public;

do $revoke$
declare
  target text;
begin
  foreach target in array array[
    'anon',
    'authenticated',
    'service_role',
    'manufacturer_bot',
    'manufacturer_bot_norman',
    'manufacturer_bot_onyx',
    'manufacturer_bot_sundance'
  ] loop
    if exists (select 1 from pg_roles where rolname = target) then
      execute format('revoke all on function line_event.wake_setting(text, text) from %I', target);
    end if;
  end loop;
end
$revoke$;

grant execute on function line_event.wake_setting(text, text) to current_user;

create or replace function public.wake_line_event_worker(p_manufacturer text, p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_manufacturer text := line_event.require_manufacturer(p_manufacturer);
  v_enabled text;
  v_url text;
  v_secret text;
  v_key text;
  v_body jsonb;
  v_headers jsonb;
begin
  if p_event_id is null then
    raise exception 'event_id is required';
  end if;
  if v_manufacturer = 'norman' then
    v_enabled := line_event.wake_setting('line_event_wake_http', 'line_event.wake_http');
    v_url := nullif(btrim(coalesce(line_event.wake_setting('line_event_worker_url', 'line_event.worker_url'), '')), '');
    v_secret := nullif(btrim(coalesce(line_event.wake_setting('line_event_worker_secret', 'line_event.worker_secret'), '')), '');
  elsif v_manufacturer = 'onyx' then
    v_enabled := line_event.wake_setting('line_event_onyx_wake_http', 'line_event.onyx_wake_http');
    v_url := nullif(btrim(coalesce(line_event.wake_setting('line_event_onyx_worker_url', 'line_event.onyx_worker_url'), '')), '');
    v_secret := nullif(btrim(coalesce(line_event.wake_setting('line_event_onyx_worker_secret', 'line_event.onyx_worker_secret'), '')), '');
  elsif v_manufacturer = 'sundance' then
    v_enabled := line_event.wake_setting('line_event_sundance_wake_http', 'line_event.sundance_wake_http');
    v_url := nullif(btrim(coalesce(line_event.wake_setting('line_event_sundance_worker_url', 'line_event.sundance_worker_url'), '')), '');
    v_secret := nullif(btrim(coalesce(line_event.wake_setting('line_event_sundance_worker_secret', 'line_event.sundance_worker_secret'), '')), '');
  else
    return jsonb_build_object(
      'woken', false,
      'reason', 'wake_disabled',
      'manufacturer', v_manufacturer,
      'event_id', p_event_id,
      'schema', '805-line-event/v1'
    );
  end if;
  if v_enabled is distinct from 'on' then
    return jsonb_build_object(
      'woken', false,
      'reason', 'wake_disabled',
      'manufacturer', v_manufacturer,
      'event_id', p_event_id,
      'schema', '805-line-event/v1'
    );
  end if;
  if v_url is null or v_secret is null or v_url !~ '^https://' then
    return jsonb_build_object(
      'woken', false,
      'reason', 'wake_unconfigured',
      'manufacturer', v_manufacturer,
      'event_id', p_event_id,
      'schema', '805-line-event/v1'
    );
  end if;
  select idempotency_key into v_key from line_event.events where id = p_event_id;
  if v_key is null then
    raise exception 'line event % not found', p_event_id;
  end if;
  v_body := jsonb_build_object(
    'manufacturer', v_manufacturer,
    'event_id', p_event_id,
    'idempotency_key', v_key
  );
  v_headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || v_secret
  );
  begin
    execute 'select net.http_post($1, $2, $3::jsonb, $4, $5)'
      using v_url, v_body, '{}'::jsonb, v_headers, 5000;
  exception when others then
    return jsonb_build_object(
      'woken', false,
      'reason', 'wake_unconfigured',
      'manufacturer', v_manufacturer,
      'event_id', p_event_id,
      'schema', '805-line-event/v1'
    );
  end;
  return jsonb_build_object(
    'woken', true,
    'reason', 'http',
    'manufacturer', v_manufacturer,
    'event_id', p_event_id,
    'schema', '805-line-event/v1'
  );
end
$fn$;

comment on function public.wake_line_event_worker(text, uuid) is
  'Posts one Norman, Onyx, or Sundance line event when that maker''s own wake gate, URL, and secret are set. Each value comes from vault.decrypted_secrets and falls back to the line_event database setting when that secret is absent. Otherwise returns wake_disabled or wake_unconfigured and does not call out. Lotus stays disabled. enqueue_line_event is the only caller.';

grant execute on function public.wake_line_event_worker(text, uuid) to service_role;
grant execute on function public.wake_line_event_worker(text, uuid) to current_user;

notify pgrst, 'reload schema';
