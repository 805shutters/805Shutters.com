-- Port the sales quote builder tables into the 805 Supabase project.
--
-- These tables are the live source quote-builder shape, scoped to the 805 Shutters
-- account only. Source-only FKs to external account, job, and workflow tables are intentionally
-- not copied because those tables/auth users do not exist in the 805 project.

create extension if not exists pgcrypto with schema extensions;

create or replace function public.is_805_crm_user()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.crm_profiles profile
    where profile.id = auth.uid()
      and profile.active = true
      and lower(profile.email) in (
        '805shutters@gmail.com',
        'jessica@805shutters.com',
        'khill31@msn.com'
      )
  );
$$;

revoke all on function public.is_805_crm_user() from anon;
grant execute on function public.is_805_crm_user() to authenticated, service_role;

create table if not exists public.sales_quotes (
  id uuid primary key default gen_random_uuid(),
  quote_number text not null,
  account_id uuid not null,
  status text not null default 'draft',
  customer_name text not null,
  customer_email text,
  customer_phone text,
  customer_address text,
  appointment_date date,
  installer_notes text,
  product_cost numeric default 0,
  total_amount numeric default 0,
  profit_amount numeric default 0,
  deposit_paid numeric default 0,
  balance_paid numeric default 0,
  payment_method text,
  customer_signature text,
  customer_printed_name text,
  signed_at timestamptz,
  share_token uuid default gen_random_uuid(),
  created_by uuid,
  created_job_id uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  quote_group_id uuid,
  quote_letter text not null default 'A',
  sent_at timestamptz,
  ordered_at timestamptz,
  received_at timestamptz,
  installed_at timestamptz,
  archived_at timestamptz,
  sent_via text,
  manufacturer_order_ref text,
  manufacturer_cost numeric default 0,
  manufacturer_name text,
  sales_owner text,
  sales_owner_auth_user_id uuid,
  sales_owner_set_at timestamptz,
  constraint sales_quotes_account_id_check
    check (account_id = '72ccf12a-11c0-4261-8ad0-31af8ad0bbfb'::uuid),
  constraint sales_quotes_status_check
    check (status in ('draft', 'sent', 'sold', 'ordered', 'received', 'installed', 'archived')),
  constraint sales_quotes_sent_via_check
    check (sent_via is null or sent_via in ('email', 'sms', 'both')),
  constraint sales_quotes_manufacturer_name_check
    check (manufacturer_name is null or manufacturer_name in ('Onyx', 'Norman', 'Other')),
  constraint sales_quotes_sales_owner_check
    check (sales_owner is null or sales_owner in ('mike', 'jessica')),
  constraint sales_quotes_quote_number_key unique (quote_number)
);

create index if not exists idx_sales_quotes_account
  on public.sales_quotes (account_id);
create index if not exists idx_sales_quotes_created_by
  on public.sales_quotes (created_by);
create index if not exists idx_sales_quotes_sales_owner
  on public.sales_quotes (account_id, sales_owner, signed_at desc)
  where sales_owner is not null;
create index if not exists idx_sales_quotes_share_token
  on public.sales_quotes (share_token);
create index if not exists idx_sales_quotes_status
  on public.sales_quotes (status);
create index if not exists sales_quotes_account_status_idx
  on public.sales_quotes (account_id, status, created_at desc);
create index if not exists sales_quotes_quote_group_id_idx
  on public.sales_quotes (quote_group_id)
  where quote_group_id is not null;

create table if not exists public.sales_quote_line_items (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.sales_quotes(id) on delete cascade,
  room_name text not null,
  product_type text not null,
  width_whole integer not null,
  width_fraction text not null default '0',
  height_whole integer not null,
  height_fraction text not null default '0',
  quantity integer not null default 1,
  sort_order integer not null default 0,
  created_at timestamptz default now()
);

create index if not exists idx_sales_quote_line_items_quote
  on public.sales_quote_line_items (quote_id);

create table if not exists public.sales_quote_designs (
  id uuid primary key default gen_random_uuid(),
  line_item_id uuid not null references public.sales_quote_line_items(id) on delete cascade,
  variant text not null default 'A',
  product_type text,
  supplier text,
  material text,
  louver_size text,
  tilt_type text,
  hinge_color text,
  panel_config text,
  mount_type text,
  shade_type text,
  lift_system text,
  valance text,
  fabric text,
  motor_type text,
  remote_type text,
  hard_surface_install boolean default false,
  ladder_over_15ft boolean default false,
  requires_takedown boolean default false,
  unit_price numeric default 0,
  notes text,
  options_json jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  constraint sales_quote_designs_line_item_id_variant_key unique (line_item_id, variant)
);

create index if not exists idx_sales_quote_designs_line_item
  on public.sales_quote_designs (line_item_id);

create table if not exists public.sales_quote_media (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.sales_quotes(id) on delete cascade,
  line_item_id uuid references public.sales_quote_line_items(id) on delete set null,
  source text not null default 'uploaded',
  image_url text not null,
  title text not null default 'Project photo',
  caption text,
  product_type text,
  supplier text,
  sort_order integer not null default 0,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sales_quote_media_source_check
    check (source in ('manufacturer', 'uploaded', 'customer', 'job_site'))
);

create index if not exists idx_sales_quote_media_line_item
  on public.sales_quote_media (line_item_id, created_at);
create index if not exists idx_sales_quote_media_quote_sort
  on public.sales_quote_media (quote_id, sort_order, created_at);

create table if not exists public.sales_805_appointments (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null default '72ccf12a-11c0-4261-8ad0-31af8ad0bbfb'::uuid,
  quote_id uuid references public.sales_quotes(id) on delete set null,
  customer_name text not null,
  customer_phone text,
  customer_phone_normalized text,
  customer_address text not null,
  appointment_date date not null,
  start_time time not null,
  end_time time,
  assigned_to text not null,
  status text not null default 'scheduled',
  notes text,
  source text not null default '805_voice_agent',
  created_by text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sales_805_appointments_account_id_check
    check (account_id = '72ccf12a-11c0-4261-8ad0-31af8ad0bbfb'::uuid),
  constraint sales_805_appointments_assigned_to_check
    check (assigned_to in ('Mike', 'Jessica')),
  constraint sales_805_appointments_status_check
    check (status in ('scheduled', 'completed', 'cancelled'))
);

create index if not exists idx_sales_805_appointments_account_date
  on public.sales_805_appointments (account_id, appointment_date, start_time);
create index if not exists idx_sales_805_appointments_assigned_date
  on public.sales_805_appointments (assigned_to, appointment_date, start_time)
  where status = 'scheduled';
create index if not exists idx_sales_805_appointments_quote
  on public.sales_805_appointments (quote_id)
  where quote_id is not null;

create table if not exists public.quote_order_agent_queue (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.sales_quotes(id) on delete cascade,
  account_id uuid,
  request_type text not null default 'portal_draft',
  status text not null default 'queued',
  requested_by uuid,
  requested_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  workflow_run_id uuid,
  screenshot_path text,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint quote_order_agent_queue_account_id_check
    check (account_id is null or account_id = '72ccf12a-11c0-4261-8ad0-31af8ad0bbfb'::uuid),
  constraint quote_order_agent_queue_request_type_check
    check (request_type in ('payload_dry_run', 'portal_draft')),
  constraint quote_order_agent_queue_status_check
    check (status in ('queued', 'processing', 'completed', 'failed', 'cancelled'))
);

create index if not exists idx_quote_order_agent_queue_account_status
  on public.quote_order_agent_queue (account_id, status, requested_at desc);
create unique index if not exists idx_quote_order_agent_queue_open_quote
  on public.quote_order_agent_queue (quote_id)
  where status in ('queued', 'processing');
create index if not exists idx_quote_order_agent_queue_quote_requested
  on public.quote_order_agent_queue (quote_id, requested_at desc);
create index if not exists idx_quote_order_agent_queue_status_requested
  on public.quote_order_agent_queue (status, requested_at);

create or replace function public.update_sales_quote_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.set_sales_quote_media_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.set_sales_805_appointments_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.set_quote_order_agent_queue_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.sales_quote_auto_installed()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  total_paid numeric;
begin
  if new.status is distinct from 'received' then
    return new;
  end if;

  if new.total_amount is null or new.total_amount <= 0 then
    return new;
  end if;

  if new.account_id <> '72ccf12a-11c0-4261-8ad0-31af8ad0bbfb'::uuid then
    return new;
  end if;

  total_paid := coalesce(new.deposit_paid, 0) + coalesce(new.balance_paid, 0);
  if total_paid >= new.total_amount - 0.01 then
    new.status := 'installed';
    new.installed_at := now();
  end if;

  return new;
end;
$$;

create or replace function public.next_quote_number(account_prefix text)
returns text
language plpgsql
set search_path = public, pg_temp
as $$
declare
  next_num int;
begin
  if account_prefix <> '805' then
    raise exception 'Only the 805 quote prefix is available in this CRM.';
  end if;

  if not public.is_805_crm_user() then
    raise exception '805 CRM authentication is required.';
  end if;

  select coalesce(max(nullif(regexp_replace(split_part(quote_number, '-', 2), '[^0-9]', '', 'g'), '')::int), 0) + 1
    into next_num
  from public.sales_quotes
  where account_id = '72ccf12a-11c0-4261-8ad0-31af8ad0bbfb'::uuid
    and quote_number like account_prefix || '-%';

  return account_prefix || '-' || lpad(next_num::text, 4, '0');
end;
$$;

revoke all on function public.next_quote_number(text) from anon;
grant execute on function public.next_quote_number(text) to authenticated, service_role;

drop trigger if exists sales_quotes_updated_at on public.sales_quotes;
create trigger sales_quotes_updated_at
before update on public.sales_quotes
for each row
execute function public.update_sales_quote_updated_at();

drop trigger if exists sales_quote_auto_installed_trigger on public.sales_quotes;
create trigger sales_quote_auto_installed_trigger
before update on public.sales_quotes
for each row
execute function public.sales_quote_auto_installed();

drop trigger if exists trg_sales_quote_media_updated_at on public.sales_quote_media;
create trigger trg_sales_quote_media_updated_at
before update on public.sales_quote_media
for each row
execute function public.set_sales_quote_media_updated_at();

drop trigger if exists trg_sales_805_appointments_updated_at on public.sales_805_appointments;
create trigger trg_sales_805_appointments_updated_at
before update on public.sales_805_appointments
for each row
execute function public.set_sales_805_appointments_updated_at();

drop trigger if exists trg_quote_order_agent_queue_updated_at on public.quote_order_agent_queue;
create trigger trg_quote_order_agent_queue_updated_at
before update on public.quote_order_agent_queue
for each row
execute function public.set_quote_order_agent_queue_updated_at();

create or replace function public.is_805_sales_quote(quote_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.sales_quotes quote
    where quote.id = quote_id
      and quote.account_id = '72ccf12a-11c0-4261-8ad0-31af8ad0bbfb'::uuid
  );
$$;

create or replace function public.is_805_sales_quote_line_item(line_item_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.sales_quote_line_items item
    join public.sales_quotes quote on quote.id = item.quote_id
    where item.id = line_item_id
      and quote.account_id = '72ccf12a-11c0-4261-8ad0-31af8ad0bbfb'::uuid
  );
$$;

revoke all on function public.is_805_sales_quote(uuid) from anon;
revoke all on function public.is_805_sales_quote_line_item(uuid) from anon;
grant execute on function public.is_805_sales_quote(uuid) to authenticated, service_role;
grant execute on function public.is_805_sales_quote_line_item(uuid) to authenticated, service_role;

alter table public.sales_quotes enable row level security;
alter table public.sales_quote_line_items enable row level security;
alter table public.sales_quote_designs enable row level security;
alter table public.sales_quote_media enable row level security;
alter table public.sales_805_appointments enable row level security;
alter table public.quote_order_agent_queue enable row level security;

revoke all on public.sales_quotes from anon;
revoke all on public.sales_quote_line_items from anon;
revoke all on public.sales_quote_designs from anon;
revoke all on public.sales_quote_media from anon;
revoke all on public.sales_805_appointments from anon;
revoke all on public.quote_order_agent_queue from anon;

grant select, insert, update, delete on public.sales_quotes to authenticated;
grant select, insert, update, delete on public.sales_quote_line_items to authenticated;
grant select, insert, update, delete on public.sales_quote_designs to authenticated;
grant select, insert, update, delete on public.sales_quote_media to authenticated;
grant select, insert, update, delete on public.sales_805_appointments to authenticated;
grant select, insert, update, delete on public.quote_order_agent_queue to authenticated;

drop policy if exists "805 CRM users manage sales quotes" on public.sales_quotes;
create policy "805 CRM users manage sales quotes"
on public.sales_quotes
for all
to authenticated
using (
  public.is_805_crm_user()
  and account_id = '72ccf12a-11c0-4261-8ad0-31af8ad0bbfb'::uuid
)
with check (
  public.is_805_crm_user()
  and account_id = '72ccf12a-11c0-4261-8ad0-31af8ad0bbfb'::uuid
);

drop policy if exists "805 CRM users manage sales quote line items" on public.sales_quote_line_items;
create policy "805 CRM users manage sales quote line items"
on public.sales_quote_line_items
for all
to authenticated
using (
  public.is_805_crm_user()
  and public.is_805_sales_quote(quote_id)
)
with check (
  public.is_805_crm_user()
  and public.is_805_sales_quote(quote_id)
);

drop policy if exists "805 CRM users manage sales quote designs" on public.sales_quote_designs;
create policy "805 CRM users manage sales quote designs"
on public.sales_quote_designs
for all
to authenticated
using (
  public.is_805_crm_user()
  and public.is_805_sales_quote_line_item(line_item_id)
)
with check (
  public.is_805_crm_user()
  and public.is_805_sales_quote_line_item(line_item_id)
);

drop policy if exists "805 CRM users manage sales quote media" on public.sales_quote_media;
create policy "805 CRM users manage sales quote media"
on public.sales_quote_media
for all
to authenticated
using (
  public.is_805_crm_user()
  and public.is_805_sales_quote(quote_id)
  and (line_item_id is null or public.is_805_sales_quote_line_item(line_item_id))
)
with check (
  public.is_805_crm_user()
  and public.is_805_sales_quote(quote_id)
  and (line_item_id is null or public.is_805_sales_quote_line_item(line_item_id))
);

drop policy if exists "805 CRM users manage 805 sales appointments" on public.sales_805_appointments;
create policy "805 CRM users manage 805 sales appointments"
on public.sales_805_appointments
for all
to authenticated
using (
  public.is_805_crm_user()
  and account_id = '72ccf12a-11c0-4261-8ad0-31af8ad0bbfb'::uuid
)
with check (
  public.is_805_crm_user()
  and account_id = '72ccf12a-11c0-4261-8ad0-31af8ad0bbfb'::uuid
);

drop policy if exists "805 CRM users manage quote order agent queue" on public.quote_order_agent_queue;
create policy "805 CRM users manage quote order agent queue"
on public.quote_order_agent_queue
for all
to authenticated
using (
  public.is_805_crm_user()
  and (account_id is null or account_id = '72ccf12a-11c0-4261-8ad0-31af8ad0bbfb'::uuid)
  and public.is_805_sales_quote(quote_id)
)
with check (
  public.is_805_crm_user()
  and (account_id is null or account_id = '72ccf12a-11c0-4261-8ad0-31af8ad0bbfb'::uuid)
  and public.is_805_sales_quote(quote_id)
);

drop view if exists public.crm_users;
create view public.crm_users
with (security_barrier = true)
as
select
  profile.id,
  profile.id as auth_user_id,
  profile.email,
  profile.display_name,
  profile.display_name as full_name
from public.crm_profiles profile
where profile.active = true
  and profile.id = auth.uid()
  and lower(profile.email) in (
    '805shutters@gmail.com',
    'jessica@805shutters.com',
    'khill31@msn.com'
  );

revoke all on public.crm_users from anon;
grant select on public.crm_users to authenticated;
