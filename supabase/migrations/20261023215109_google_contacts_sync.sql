-- 805 only. No tokens or customer exceptions are readable by browser roles.
create table public.crm_google_contacts_connection (
  id boolean primary key default true check (id),
  account_email text not null check (account_email = '805@805shutters.com'),
  google_subject text not null,
  encrypted_refresh_token text not null,
  connected_at timestamptz not null default now(),
  connected_by uuid not null,
  enabled boolean not null default true,
  lease_id uuid,
  lease_until timestamptz
);
create table public.crm_google_contacts_oauth_states (
  state_hash text primary key,
  encrypted_verifier text not null,
  actor_id uuid not null,
  expires_at timestamptz not null default now() + interval '10 minutes'
);
create table public.crm_google_contacts_sync (
  customer_key text primary key,
  source_refs text[] not null default '{}',
  google_resource_name text unique,
  status text not null default 'pending' check (status in ('pending','synced','missing_data','ambiguous','failed','uncertain','removed')),
  exception_code text,
  attempts integer not null default 0,
  create_attempted_at timestamptz,
  next_attempt_at timestamptz not null default now(),
  synced_at timestamptz,
  requested_at timestamptz not null default now(),
  processed_request_at timestamptz,
  updated_at timestamptz not null default now()
);
create index crm_google_contacts_due on public.crm_google_contacts_sync(status,next_attempt_at);
alter table public.crm_google_contacts_connection enable row level security;
alter table public.crm_google_contacts_oauth_states enable row level security;
alter table public.crm_google_contacts_sync enable row level security;
revoke all on public.crm_google_contacts_connection, public.crm_google_contacts_oauth_states, public.crm_google_contacts_sync from public, anon, authenticated;
grant all on public.crm_google_contacts_connection, public.crm_google_contacts_oauth_states, public.crm_google_contacts_sync to service_role;

-- Queue insertion is in the transaction that records the sale. It survives an
-- application crash after signing or staff status updates; no Google call runs here.
create function public.crm_queue_google_contact() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare customer_name text; source_meta jsonb; old_name text; customer_key text;
begin
  if tg_table_name = 'crm_quotes' then
    if new.status <> 'sold' then return new; end if;
    select j.customer_name into customer_name from public.crm_jobs j where j.id = new.job_id;
    customer_name := coalesce(nullif(customer_name,''),new.customer_printed_name);
  elsif tg_table_name = 'crm_jobs' then
    customer_name := new.customer_name;
    if new.status <> 'sold' and not exists(select 1 from public.crm_google_contacts_sync s where s.source_refs @> array['job:' || new.id::text]) then return new; end if;
  elsif tg_table_name = 'crm_customers' then
    customer_name := new.display_name;
    if coalesce(new.latest_status,'') <> 'sold' and not exists(select 1 from public.crm_google_contacts_sync s where s.source_refs @> array['customer:' || new.id::text]) then return new; end if;
  else
    if new.status <> 'sold' then return new; end if;
    select c.display_name into customer_name from public.crm_customers c where c.id = new.customer_id;
  end if;
  customer_key := trim(regexp_replace(lower(trim(coalesce(customer_name,''))), '[^a-z0-9]+', ' ', 'g'));
  if customer_key = '' then return new; end if;
  insert into public.crm_google_contacts_sync(customer_key) values (customer_key)
  on conflict (customer_key) do update set status = 'pending', exception_code = null, requested_at = clock_timestamp(), next_attempt_at = now(), updated_at = now();
  return new;
end;
$$;
revoke all on function public.crm_queue_google_contact() from public, anon, authenticated;
grant execute on function public.crm_queue_google_contact() to service_role;
create trigger crm_quotes_google_contact after insert or update on public.crm_quotes for each row execute function public.crm_queue_google_contact();
create trigger crm_jobs_google_contact after insert or update on public.crm_jobs for each row execute function public.crm_queue_google_contact();
create trigger crm_customers_google_contact after insert or update on public.crm_customers for each row execute function public.crm_queue_google_contact();
create trigger crm_contracts_google_contact after insert or update on public.crm_customer_contracts for each row execute function public.crm_queue_google_contact();

-- One writer per destination, including concurrent cron/manual backfill invocations.
create function public.crm_google_contacts_lock(lock_id uuid) returns boolean
language sql security invoker set search_path = '' as $$
  with locked as (
    update public.crm_google_contacts_connection set lease_id = lock_id, lease_until = now() + interval '10 minutes'
    where id and enabled and (lease_until is null or lease_until < now()) returning id
  ) select exists(select 1 from locked);
$$;
revoke all on function public.crm_google_contacts_lock(uuid) from public, anon, authenticated;
grant execute on function public.crm_google_contacts_lock(uuid) to service_role;
